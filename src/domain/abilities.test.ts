import { describe, expect, it } from 'vitest';
import {
  abilityModifier,
  formatModifier,
  parseChallengeRating,
  passivePerception,
  proficiencyBonusForCR,
  proficiencyBonusForLevel,
} from './abilities';

describe('abilityModifier', () => {
  it('D&D 5e 공식 floor((점수-10)/2)을 따른다', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(30)).toBe(10);
  });

  it('10 미만에서 음수 수정치를 내림 처리한다', () => {
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(7)).toBe(-2);
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(0)).toBe(-5);
  });

  it('숫자가 아니면 0을 반환한다', () => {
    expect(abilityModifier(Number.NaN)).toBe(0);
    expect(abilityModifier(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatModifier', () => {
  it('부호를 항상 표시한다', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-2)).toBe('-2');
  });
});

describe('proficiencyBonusForLevel', () => {
  it('4레벨마다 1씩 증가한다', () => {
    expect(proficiencyBonusForLevel(1)).toBe(2);
    expect(proficiencyBonusForLevel(4)).toBe(2);
    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(proficiencyBonusForLevel(9)).toBe(4);
    expect(proficiencyBonusForLevel(17)).toBe(6);
    expect(proficiencyBonusForLevel(20)).toBe(6);
  });

  it('범위를 벗어난 레벨을 1~20으로 제한한다', () => {
    expect(proficiencyBonusForLevel(0)).toBe(2);
    expect(proficiencyBonusForLevel(-5)).toBe(2);
    expect(proficiencyBonusForLevel(99)).toBe(6);
  });
});

describe('parseChallengeRating', () => {
  it('분수 도전 등급을 해석한다', () => {
    expect(parseChallengeRating('1/8')).toBeCloseTo(0.125);
    expect(parseChallengeRating('1/4')).toBe(0.25);
    expect(parseChallengeRating('1/2')).toBe(0.5);
    expect(parseChallengeRating('7')).toBe(7);
    expect(parseChallengeRating('  12 ')).toBe(12);
  });

  it('해석할 수 없으면 0을 반환한다', () => {
    expect(parseChallengeRating('없음')).toBe(0);
    expect(parseChallengeRating('')).toBe(0);
  });
});

describe('proficiencyBonusForCR', () => {
  it('CR 4 이하는 +2다', () => {
    expect(proficiencyBonusForCR('0')).toBe(2);
    expect(proficiencyBonusForCR('1/4')).toBe(2);
    expect(proficiencyBonusForCR('4')).toBe(2);
  });

  it('CR 5부터 4단계마다 증가한다', () => {
    expect(proficiencyBonusForCR('5')).toBe(3);
    expect(proficiencyBonusForCR('8')).toBe(3);
    expect(proficiencyBonusForCR('9')).toBe(4);
    expect(proficiencyBonusForCR('17')).toBe(6);
  });
});

describe('passivePerception', () => {
  it('10 + 지혜 수정치를 계산한다', () => {
    expect(passivePerception(14)).toBe(12);
    expect(passivePerception(8)).toBe(9);
  });

  it('숙련이 있으면 숙련 보너스를 더한다', () => {
    expect(passivePerception(14, true, 3)).toBe(15);
  });
});
