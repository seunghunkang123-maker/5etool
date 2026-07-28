import { describe, expect, it } from 'vitest';
import {
  applyDamage,
  applyHealing,
  fullHeal,
  hpTier,
  knockOut,
  resolveAreaDamage,
  setMaxHp,
  setTempHp,
} from './hp';

describe('applyDamage', () => {
  it('임시 HP를 먼저 차감한다', () => {
    const result = applyDamage({ hp: 20, maxHp: 20, tempHp: 5 }, 3);
    expect(result.tempHp).toBe(2);
    expect(result.hp).toBe(20);
    expect(result.absorbedByTemp).toBe(3);
    expect(result.appliedToHp).toBe(0);
  });

  it('임시 HP를 초과한 피해는 현재 HP에서 차감한다', () => {
    const result = applyDamage({ hp: 20, maxHp: 20, tempHp: 5 }, 8);
    expect(result.tempHp).toBe(0);
    expect(result.hp).toBe(17);
    expect(result.absorbedByTemp).toBe(5);
    expect(result.appliedToHp).toBe(3);
  });

  it('현재 HP는 0보다 작아지지 않는다', () => {
    const result = applyDamage({ hp: 4, maxHp: 30, tempHp: 0 }, 100);
    expect(result.hp).toBe(0);
    expect(result.appliedToHp).toBe(4);
    expect(result.droppedToZero).toBe(true);
  });

  it('이미 0인 대상은 다시 0으로 떨어졌다고 보고하지 않는다', () => {
    const result = applyDamage({ hp: 0, maxHp: 30, tempHp: 0 }, 10);
    expect(result.hp).toBe(0);
    expect(result.droppedToZero).toBe(false);
  });

  it('음수 피해와 소수를 안전하게 처리한다', () => {
    expect(applyDamage({ hp: 10, maxHp: 10, tempHp: 0 }, -5).hp).toBe(10);
    expect(applyDamage({ hp: 10, maxHp: 10, tempHp: 0 }, 3.7).hp).toBe(7);
  });

  it('입력 객체를 변경하지 않는다', () => {
    const state = { hp: 10, maxHp: 10, tempHp: 2 };
    applyDamage(state, 5);
    expect(state).toEqual({ hp: 10, maxHp: 10, tempHp: 2 });
  });
});

describe('applyHealing', () => {
  it('최대 HP를 초과하지 않는다', () => {
    const result = applyHealing({ hp: 18, maxHp: 20, tempHp: 0 }, 10);
    expect(result.hp).toBe(20);
    expect(result.healed).toBe(2);
  });

  it('전투 불능 상태에서도 회복된다', () => {
    expect(applyHealing({ hp: 0, maxHp: 20, tempHp: 0 }, 5).hp).toBe(5);
  });

  it('임시 HP는 회복에 영향받지 않는다', () => {
    expect(applyHealing({ hp: 5, maxHp: 20, tempHp: 4 }, 5).tempHp).toBe(4);
  });
});

describe('setTempHp', () => {
  it('기본적으로 더 높은 값으로만 대체한다 (누적되지 않음)', () => {
    expect(setTempHp({ hp: 10, maxHp: 10, tempHp: 5 }, 3).tempHp).toBe(5);
    expect(setTempHp({ hp: 10, maxHp: 10, tempHp: 5 }, 9).tempHp).toBe(9);
  });

  it('force 모드에서는 그대로 설정한다', () => {
    expect(setTempHp({ hp: 10, maxHp: 10, tempHp: 5 }, 0, 'force').tempHp).toBe(0);
  });
});

describe('setMaxHp / fullHeal / knockOut', () => {
  it('최대 HP를 줄이면 현재 HP도 함께 줄어든다', () => {
    const result = setMaxHp({ hp: 20, maxHp: 20, tempHp: 0 }, 12);
    expect(result).toMatchObject({ hp: 12, maxHp: 12 });
  });

  it('최대치 회복과 즉시 처치', () => {
    expect(fullHeal({ hp: 1, maxHp: 30, tempHp: 0 }).hp).toBe(30);
    expect(knockOut({ hp: 30, maxHp: 30, tempHp: 9 })).toMatchObject({ hp: 0, tempHp: 0 });
  });
});

describe('hpTier', () => {
  it('요구된 구간대로 부상 단계를 구분한다', () => {
    expect(hpTier(100, 100)).toBe('healthy');
    expect(hpTier(76, 100)).toBe('healthy');
    expect(hpTier(75, 100)).toBe('bruised');
    expect(hpTier(51, 100)).toBe('bruised');
    expect(hpTier(50, 100)).toBe('wounded');
    expect(hpTier(26, 100)).toBe('wounded');
    expect(hpTier(25, 100)).toBe('critical');
    expect(hpTier(1, 100)).toBe('critical');
    expect(hpTier(0, 100)).toBe('down');
  });

  it('최대 HP가 0인 비정상 데이터를 처리한다', () => {
    expect(hpTier(0, 0)).toBe('down');
    expect(hpTier(5, 0)).toBe('healthy');
  });
});

describe('resolveAreaDamage', () => {
  it('광역 피해 적용 방식을 계산한다', () => {
    expect(resolveAreaDamage(11, 'full')).toBe(11);
    expect(resolveAreaDamage(11, 'half')).toBe(5);
    expect(resolveAreaDamage(11, 'none')).toBe(0);
    expect(resolveAreaDamage(11, 'custom', 7)).toBe(7);
  });
});
