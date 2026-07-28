import { describe, expect, it } from 'vitest';
import { generatedMonsterToCard, monsterPromptSchema, parseGeneratedMonster, xpForCR } from './monsterSchema';

const valid = {
  name: '얼음 호수의 기사',
  cr: '7',
  ac: 18,
  hp: 120,
  abilities: { str: 18, dex: 12, con: 18, int: 10, wis: 12, cha: 14 },
  actions: [{ name: '냉기 검', description: '명중 +8, 피해 15 (2d8+5) 냉기 피해.' }],
};

describe('parseGeneratedMonster', () => {
  it('올바른 응답을 통과시키고 기본값을 채운다', () => {
    const result = parseGeneratedMonster(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe('얼음 호수의 기사');
      expect(result.data.size).toBe('중형');
      expect(result.data.speeds.walk).toBe(30);
      expect(result.data.traits).toEqual([]);
    }
  });

  it('필수 필드가 없으면 거부한다', () => {
    const result = parseGeneratedMonster({ name: '이름만 있음' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('형식이 올바르지 않습니다');
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('범위를 벗어난 능력치를 거부한다', () => {
    const result = parseGeneratedMonster({ ...valid, abilities: { ...valid.abilities, str: 99 } });
    expect(result.ok).toBe(false);
  });

  it('HP가 음수이면 거부한다', () => {
    expect(parseGeneratedMonster({ ...valid, hp: -10 }).ok).toBe(false);
  });

  it('null이나 문자열 응답을 거부한다', () => {
    expect(parseGeneratedMonster(null).ok).toBe(false);
    expect(parseGeneratedMonster('{}').ok).toBe(false);
  });

  it('과도하게 긴 설명을 거부한다', () => {
    expect(parseGeneratedMonster({ ...valid, description: 'x'.repeat(5000) }).ok).toBe(false);
  });

  it('행동 개수 상한을 강제한다', () => {
    const actions = Array.from({ length: 30 }, (_, i) => ({ name: `행동 ${i}`, description: '설명' }));
    expect(parseGeneratedMonster({ ...valid, actions }).ok).toBe(false);
  });
});

describe('monsterPromptSchema', () => {
  it('너무 짧거나 긴 입력을 거부한다', () => {
    expect(monsterPromptSchema.safeParse({ prompt: '짧음' }).success).toBe(false);
    expect(monsterPromptSchema.safeParse({ prompt: 'x'.repeat(2000) }).success).toBe(false);
  });

  it('정상 입력을 통과시킨다', () => {
    const result = monsterPromptSchema.safeParse({ prompt: '얼음 호수의 언데드 기사', target_cr: '7', party_size: 4 });
    expect(result.success).toBe(true);
  });
});

describe('generatedMonsterToCard', () => {
  it('AI 결과를 카드 저장 형태로 변환한다', () => {
    const parsed = parseGeneratedMonster({ ...valid, traits: [{ name: '냉기 반격', description: '설명' }], tactics: '먼저 얼린다' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const converted = generatedMonsterToCard(parsed.data);
    expect(converted.name).toBe('얼음 호수의 기사');
    expect(converted.stats.max_hp).toBe(120);
    expect(converted.stats.proficiency_bonus).toBe(3);
    expect(converted.stats.passive_perception).toBe(11);
    expect(converted.sections.map((s) => s.kind)).toEqual(['trait', 'action']);
    expect(converted.dm_notes).toContain('먼저 얼린다');
  });
});

describe('xpForCR', () => {
  it('도전 등급에 맞는 경험치를 반환한다', () => {
    expect(xpForCR(1)).toBe(200);
    expect(xpForCR(7)).toBe(2900);
    expect(xpForCR(30)).toBe(155000);
    expect(xpForCR(99)).toBe(0);
  });
});
