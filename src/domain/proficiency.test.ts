import { describe, expect, it } from 'vitest';
import { fromProficiency, proficiencyShare, proficiencyTotal, toProficiency, withProficiency } from './proficiency';

/**
 * 바드의 재주꾼(절반)과 도적·바드의 전문성(2배)을 표현하기 위한 계산.
 * 예전에는 참/거짓만 저장했으므로 그 값도 계속 읽을 수 있어야 한다.
 */
describe('toProficiency', () => {
  it('구버전의 true는 숙련으로 읽는다', () => {
    expect(toProficiency(true)).toEqual({ level: 'proficient', bonus: 0 });
  });

  it('false·null·undefined는 숙련 없음', () => {
    for (const value of [false, null, undefined]) {
      expect(toProficiency(value)).toEqual({ level: 'none', bonus: 0 });
    }
  });

  it('새 형태를 그대로 읽는다', () => {
    expect(toProficiency({ level: 'expertise', bonus: 2 })).toEqual({ level: 'expertise', bonus: 2 });
  });

  it('알 수 없는 단계는 없음으로 본다', () => {
    expect(toProficiency({ level: 'wat' } as never).level).toBe('none');
  });

  it('보정치는 정수로 자르고 범위를 제한한다', () => {
    expect(toProficiency({ level: 'proficient', bonus: 2.9 }).bonus).toBe(2);
    expect(toProficiency({ level: 'proficient', bonus: 1000 }).bonus).toBe(99);
    expect(toProficiency({ level: 'proficient', bonus: Number.NaN }).bonus).toBe(0);
  });
});

describe('proficiencyShare', () => {
  it('5e 규칙대로 계산한다', () => {
    expect(proficiencyShare('none', 3)).toBe(0);
    expect(proficiencyShare('proficient', 3)).toBe(3);
    expect(proficiencyShare('expertise', 3)).toBe(6);
    // 재주꾼은 내림
    expect(proficiencyShare('half', 3)).toBe(1);
    expect(proficiencyShare('half', 4)).toBe(2);
  });
});

describe('proficiencyTotal', () => {
  it('능력 수정치 + 숙련 몫 + 고정 보정치', () => {
    // 민첩 수정치 +4, 숙련 보너스 3, 전문성 → 4 + 6 = 10
    expect(proficiencyTotal(4, 3, { level: 'expertise' })).toBe(10);
    // 여기에 마법 물품 +1
    expect(proficiencyTotal(4, 3, { level: 'expertise', bonus: 1 })).toBe(11);
    // 숙련이 없어도 고정 보정치는 붙는다
    expect(proficiencyTotal(1, 3, { level: 'none', bonus: 2 })).toBe(3);
    // 구버전 true
    expect(proficiencyTotal(2, 3, true)).toBe(5);
    // 값이 없으면 능력 수정치만
    expect(proficiencyTotal(2, 3, undefined)).toBe(2);
  });
});

describe('fromProficiency / withProficiency', () => {
  it('빈 상태는 저장하지 않는다', () => {
    expect(fromProficiency({ level: 'none', bonus: 0 })).toBeUndefined();
  });

  it('보정치가 0이면 단계만 저장한다', () => {
    expect(fromProficiency({ level: 'proficient', bonus: 0 })).toEqual({ level: 'proficient' });
  });

  it('빈 상태로 되돌리면 항목이 사라진다', () => {
    const before = { stealth: { level: 'expertise' as const } };
    expect(withProficiency(before, 'stealth', { level: 'none', bonus: 0 })).toEqual({});
  });

  it('다른 항목은 건드리지 않는다', () => {
    const before = { stealth: true, arcana: { level: 'half' as const } };
    const after = withProficiency(before, 'stealth', { level: 'expertise', bonus: 1 });
    expect(after).toEqual({ stealth: { level: 'expertise', bonus: 1 }, arcana: { level: 'half' } });
    // 원본은 그대로다.
    expect(before.stealth).toBe(true);
  });
});
