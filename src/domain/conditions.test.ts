import { describe, expect, it } from 'vitest';
import type { CombatantCondition, DurationMode } from '@/data/types';
import { describeDuration, expiredConditions, expiredOnTurnChange, remainingRounds } from './conditions';

type Cond = Pick<CombatantCondition, 'id' | 'combatant_id' | 'duration_mode' | 'duration_rounds' | 'started_round' | 'source_combatant_id'>;

function cond(overrides: Partial<Cond> & { id: string }): Cond {
  return {
    combatant_id: 'target',
    duration_mode: 'manual' as DurationMode,
    duration_rounds: null,
    started_round: 1,
    source_combatant_id: null,
    ...overrides,
  };
}

describe('remainingRounds', () => {
  it('남은 라운드를 계산한다', () => {
    const c = cond({ id: '1', duration_mode: 'rounds', duration_rounds: 3, started_round: 2 });
    expect(remainingRounds(c, 2)).toBe(3);
    expect(remainingRounds(c, 4)).toBe(1);
    expect(remainingRounds(c, 5)).toBe(0);
    expect(remainingRounds(c, 9)).toBe(0);
  });

  it('라운드 기반이 아니면 null이다', () => {
    expect(remainingRounds(cond({ id: '1', duration_mode: 'manual' }), 3)).toBeNull();
  });
});

describe('expiredConditions', () => {
  it('수동 해제 효과는 자동으로 만료되지 않는다', () => {
    const list = [cond({ id: '1', duration_mode: 'manual' })];
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 99 })).toHaveLength(0);
  });

  it('라운드 효과는 대상의 턴 시작에 만료된다', () => {
    const list = [cond({ id: '1', duration_mode: 'rounds', duration_rounds: 2, started_round: 1 })];
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 2 })).toHaveLength(0);
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 3 })).toHaveLength(1);
  });

  it('라운드 효과는 다른 참가자의 턴에는 만료되지 않는다', () => {
    const list = [cond({ id: '1', duration_mode: 'rounds', duration_rounds: 1, started_round: 1 })];
    expect(expiredConditions(list, { phase: 'start', combatantId: 'other', round: 5 })).toHaveLength(0);
  });

  it('"대상의 다음 턴 시작까지"는 적용된 라운드 이후에 만료된다', () => {
    const list = [cond({ id: '1', duration_mode: 'target_turn_start', started_round: 1 })];
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 1 })).toHaveLength(0);
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 2 })).toHaveLength(1);
  });

  it('"대상의 다음 턴 종료까지"는 같은 라운드 턴 종료에 만료된다', () => {
    const list = [cond({ id: '1', duration_mode: 'target_turn_end', started_round: 2 })];
    expect(expiredConditions(list, { phase: 'end', combatantId: 'target', round: 2 })).toHaveLength(1);
    expect(expiredConditions(list, { phase: 'start', combatantId: 'target', round: 2 })).toHaveLength(0);
  });

  it('시전자 기준 효과는 시전자의 턴에 만료된다', () => {
    const list = [cond({ id: '1', duration_mode: 'source_turn_end', started_round: 1, source_combatant_id: 'caster' })];
    expect(expiredConditions(list, { phase: 'end', combatantId: 'target', round: 1 })).toHaveLength(0);
    expect(expiredConditions(list, { phase: 'end', combatantId: 'caster', round: 1 })).toHaveLength(1);
  });
});

describe('expiredOnTurnChange', () => {
  it('턴 종료와 다음 턴 시작에서 만료되는 효과를 함께 모은다', () => {
    const list = [
      cond({ id: 'end-effect', combatant_id: 'a', duration_mode: 'target_turn_end', started_round: 1 }),
      cond({ id: 'start-effect', combatant_id: 'b', duration_mode: 'target_turn_start', started_round: 1 }),
      cond({ id: 'keep', combatant_id: 'b', duration_mode: 'manual' }),
    ];
    const expired = expiredOnTurnChange(list, {
      endingCombatantId: 'a',
      endingRound: 1,
      startingCombatantId: 'b',
      startingRound: 2,
    });
    expect(expired.map((c) => c.id).sort()).toEqual(['end-effect', 'start-effect']);
  });

  it('같은 효과를 중복해서 반환하지 않는다', () => {
    const list = [cond({ id: 'x', combatant_id: 'a', duration_mode: 'target_turn_end', started_round: 1 })];
    const expired = expiredOnTurnChange(list, {
      endingCombatantId: 'a',
      endingRound: 1,
      startingCombatantId: 'a',
      startingRound: 1,
    });
    expect(expired).toHaveLength(1);
  });
});

describe('describeDuration', () => {
  it('남은 라운드를 한국어로 표시한다', () => {
    expect(describeDuration(cond({ id: '1', duration_mode: 'rounds', duration_rounds: 3, started_round: 1 }), 2)).toBe('2라운드 남음');
  });

  it('모드별 설명을 반환한다', () => {
    expect(describeDuration(cond({ id: '1', duration_mode: 'manual' }), 1)).toBe('수동 해제까지');
    expect(describeDuration(cond({ id: '1', duration_mode: 'source_turn_start' }), 1)).toBe('시전자 턴 시작까지');
  });
});
