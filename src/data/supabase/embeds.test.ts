import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PostgREST 임베드 회귀 방지.
 *
 * combatant_conditions에는 encounter_combatants를 가리키는 외래 키가 둘 있다.
 *   - combatant_id        (상태가 걸린 대상)
 *   - source_combatant_id (상태를 건 시전자)
 * 이 상태에서 `select('*, conditions:combatant_conditions(*)')`처럼 임베드하면
 * PostgREST가 어느 관계인지 정하지 못해 요청 전체가 실패한다(PGRST201).
 * 그러면 전투 참가자 목록이 통째로 비어 "참가자 추가가 안 되는" 것처럼 보인다.
 *
 * 실수로 다시 임베드로 되돌리지 않도록 소스를 직접 확인한다.
 */
const source = readFileSync(join(process.cwd(), 'src/data/supabase/repo.ts'), 'utf8');

/** select('...') 안에 적힌 문자열만 모은다. 주석은 제외된다. */
function selectStrings(): string[] {
  return [...source.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)].map((m) => m[2] ?? '');
}

describe('PostgREST select 문자열', () => {
  it('combatant_conditions를 임베드하지 않는다', () => {
    const offenders = selectStrings().filter((s) => s.includes('combatant_conditions'));
    expect(offenders).toEqual([]);
  });

  it('외래 키가 둘인 관계를 임베드하려면 힌트를 붙여야 한다', () => {
    // 임베드 문법: `별칭:테이블(...)` 또는 `테이블(...)`.
    // 두 외래 키를 가진 테이블 목록을 여기에 적어 두고, 힌트(!) 없이 쓰였는지 본다.
    const ambiguousTables = ['combatant_conditions'];
    for (const table of ambiguousTables) {
      for (const select of selectStrings()) {
        const embed = new RegExp(`${table}\\s*\\(`);
        const hinted = new RegExp(`${table}!\\w+\\s*\\(`);
        if (embed.test(select)) {
          expect(hinted.test(select), `${table} 임베드에는 외래 키 힌트가 필요하다: ${select}`).toBe(true);
        }
      }
    }
  });

  it('검사 자체가 동작하는지 확인한다', () => {
    // 정규식이 select 문자열을 실제로 찾아내는지(0건이면 검사가 무의미하다).
    expect(selectStrings().length).toBeGreaterThan(10);
  });
});
