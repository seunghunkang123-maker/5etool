import { describe, expect, it } from 'vitest';
import { MAX_COMBATANT_COUNT, dexModifierOf, normalizeCombatantInput } from './combatant';
import { combatantNames } from './initiative';
import type { CombatantInput } from '@/data/repository';

const base: CombatantInput = { source_type: 'monster', name: '고블린', hp: 7, max_hp: 7, ac: 15 };

describe('normalizeCombatantInput', () => {
  it('정상 입력은 그대로 유지한다', () => {
    const result = normalizeCombatantInput({ ...base, dex_score: 14 });
    expect(result).toMatchObject({ name: '고블린', hp: 7, max_hp: 7, ac: 15, dex_score: 14, dex_mod: 2, count: 1 });
  });

  it('현재 HP가 최대 HP보다 크면 최대 HP로 맞춘다', () => {
    // 오래된 카드 자료에 hp > max_hp가 남아 있으면 데이터베이스 제약에 걸려 추가가 실패했다.
    const result = normalizeCombatantInput({ ...base, hp: 40, max_hp: 12 });
    expect(result.hp).toBe(12);
    expect(result.max_hp).toBe(12);
  });

  it('최대 HP가 0 이하면 최소 1로 올린다', () => {
    expect(normalizeCombatantInput({ ...base, hp: 0, max_hp: 0 }).max_hp).toBe(1);
    expect(normalizeCombatantInput({ ...base, hp: 0, max_hp: -5 }).max_hp).toBe(1);
  });

  it('숫자가 아닌 값은 기본값으로 되돌린다', () => {
    const result = normalizeCombatantInput({
      ...base,
      hp: Number.NaN,
      max_hp: Number.NaN,
      ac: Number.NaN,
      dex_score: Number.NaN,
      count: Number.NaN,
    });
    expect(result.hp).toBe(1);
    expect(result.max_hp).toBe(1);
    expect(result.ac).toBe(10);
    expect(result.dex_score).toBe(10);
    expect(result.count).toBe(1);
  });

  it('소수점은 잘라 정수로 만든다', () => {
    const result = normalizeCombatantInput({ ...base, hp: 7.9, max_hp: 12.4, ac: 15.6, count: 3.7 });
    expect(result.hp).toBe(7);
    expect(result.max_hp).toBe(12);
    expect(result.ac).toBe(15);
    expect(result.count).toBe(3);
  });

  it('수량과 능력치는 허용 범위 안으로 자른다', () => {
    expect(normalizeCombatantInput({ ...base, count: 999 }).count).toBe(MAX_COMBATANT_COUNT);
    expect(normalizeCombatantInput({ ...base, count: 0 }).count).toBe(1);
    expect(normalizeCombatantInput({ ...base, dex_score: 99 }).dex_score).toBe(30);
    expect(normalizeCombatantInput({ ...base, dex_score: 0 }).dex_score).toBe(1);
    expect(normalizeCombatantInput({ ...base, ac: -3 }).ac).toBe(0);
  });

  it('이름이 비어 있으면 기본 이름을 쓴다', () => {
    expect(normalizeCombatantInput({ ...base, name: '   ' }).name).toBe('참가자');
  });

  it('플레이어 캐릭터는 HP 숫자를 기본으로 공개한다', () => {
    expect(normalizeCombatantInput({ ...base, source_type: 'pc' }).hide_hp_numbers).toBe(false);
    expect(normalizeCombatantInput({ ...base, source_type: 'monster' }).hide_hp_numbers).toBe(true);
    expect(normalizeCombatantInput({ ...base, source_type: 'pc', hide_hp_numbers: true }).hide_hp_numbers).toBe(true);
  });

  it('이니셔티브는 null을 그대로 유지한다', () => {
    expect(normalizeCombatantInput(base).initiative).toBeNull();
    expect(normalizeCombatantInput({ ...base, initiative: null }).initiative).toBeNull();
    expect(normalizeCombatantInput({ ...base, initiative: 18 }).initiative).toBe(18);
  });
});

describe('dexModifierOf', () => {
  it('5e 규칙대로 계산한다', () => {
    expect(dexModifierOf(10)).toBe(0);
    expect(dexModifierOf(11)).toBe(0);
    expect(dexModifierOf(14)).toBe(2);
    expect(dexModifierOf(8)).toBe(-1);
    expect(dexModifierOf(1)).toBe(-5);
  });
});

describe('combatantNames', () => {
  it('하나만 넣고 이름이 겹치지 않으면 그대로 쓴다', () => {
    expect(combatantNames('고블린', 1, [])).toEqual(['고블린']);
  });

  it('여러 마리는 1번부터 번호를 붙인다', () => {
    expect(combatantNames('고블린', 3, [])).toEqual(['고블린 1', '고블린 2', '고블린 3']);
  });

  it('이미 있는 이름과 겹치면 다음 번호를 잇는다', () => {
    expect(combatantNames('고블린', 2, ['고블린 1', '고블린 2'])).toEqual(['고블린 3', '고블린 4']);
  });

  it('번호 없는 같은 이름이 있으면 2번부터 붙인다', () => {
    expect(combatantNames('고블린', 1, ['고블린'])).toEqual(['고블린 2']);
  });

  it('다른 이름과는 섞이지 않는다', () => {
    expect(combatantNames('고블린', 1, ['홉고블린', '고블린 대장'])).toEqual(['고블린']);
  });

  it('이름이 비어 있어도 만들어 낸다', () => {
    expect(combatantNames('  ', 2, [])).toEqual(['참가자 1', '참가자 2']);
  });
});
