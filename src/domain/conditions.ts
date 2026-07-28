import type { CombatantCondition, DurationMode } from '@/data/types';

/**
 * 상태 효과 지속 시간 규칙.
 * 턴 진행 시 어떤 효과가 만료되는지 순수 함수로 계산한다.
 */

/** D&D 5e 기본 상태 */
export interface ConditionTemplate {
  key: string;
  name: string;
  icon: string;
  description: string;
}

export const DND5E_CONDITIONS: ConditionTemplate[] = [
  { key: 'blinded', name: '장님', icon: 'eye-off', description: '볼 수 없으며 시각에 의존하는 판정에 자동 실패한다. 공격 굴림에 불리점, 자신을 향한 공격에 이점.' },
  { key: 'charmed', name: '매혹', icon: 'heart', description: '매혹한 자를 공격할 수 없고, 매혹한 자는 대상에게 사회적 상호작용에 이점을 받는다.' },
  { key: 'deafened', name: '귀머거리', icon: 'ear-off', description: '들을 수 없으며 청각에 의존하는 판정에 자동 실패한다.' },
  { key: 'frightened', name: '공포', icon: 'ghost', description: '공포 근원이 시야에 있으면 능력 판정과 공격 굴림에 불리점. 근원에게 다가갈 수 없다.' },
  { key: 'grappled', name: '붙잡힘', icon: 'grab', description: '이동 속도가 0이 된다.' },
  { key: 'incapacitated', name: '행동 불능', icon: 'ban', description: '행동이나 반응을 할 수 없다.' },
  { key: 'invisible', name: '투명', icon: 'eye-closed', description: '볼 수 없으며 공격 굴림에 이점, 자신을 향한 공격에 불리점.' },
  { key: 'paralyzed', name: '마비', icon: 'zap-off', description: '행동 불능이며 움직이거나 말할 수 없다. 근접 공격은 자동 치명타.' },
  { key: 'petrified', name: '석화', icon: 'gem', description: '무생물로 변한다. 행동 불능, 모든 피해에 저항.' },
  { key: 'poisoned', name: '중독', icon: 'flask-conical', description: '공격 굴림과 능력 판정에 불리점.' },
  { key: 'prone', name: '넘어짐', icon: 'arrow-down', description: '포복 이동만 가능. 근접 공격에 이점, 원거리 공격에 불리점.' },
  { key: 'restrained', name: '구속', icon: 'link', description: '이동 속도 0. 공격 굴림에 불리점, 자신을 향한 공격에 이점, 민첩 내성에 불리점.' },
  { key: 'stunned', name: '기절', icon: 'star', description: '행동 불능이며 힘·민첩 내성에 자동 실패한다.' },
  { key: 'unconscious', name: '의식 불명', icon: 'moon', description: '행동 불능, 넘어짐 상태. 근접 공격은 자동 치명타.' },
  { key: 'exhaustion', name: '탈진', icon: 'battery-low', description: '단계에 따라 누적되는 불이익을 받는다. (1~6단계)' },
  { key: 'concentrating', name: '집중', icon: 'brain', description: '주문에 집중하고 있다. 피해를 받으면 건강 내성이 필요하다.' },
];

export const CONDITION_MAP = new Map(DND5E_CONDITIONS.map((c) => [c.key, c]));

export interface TurnEvent {
  /** 'start' = 해당 참가자의 턴 시작, 'end' = 턴 종료 */
  phase: 'start' | 'end';
  combatantId: string;
  round: number;
}

type ConditionLike = Pick<
  CombatantCondition,
  'id' | 'combatant_id' | 'duration_mode' | 'duration_rounds' | 'started_round' | 'source_combatant_id'
>;

/**
 * 라운드 기반 효과의 남은 라운드 수.
 * duration_mode가 'rounds'가 아니면 null을 반환한다.
 */
export function remainingRounds(condition: ConditionLike, currentRound: number): number | null {
  if (condition.duration_mode !== 'rounds' || condition.duration_rounds === null) return null;
  return Math.max(0, condition.started_round + condition.duration_rounds - currentRound);
}

/** 지속 시간을 사람이 읽는 문자열로 */
export function describeDuration(condition: ConditionLike, currentRound: number): string {
  const labels: Record<DurationMode, string> = {
    rounds: '',
    target_turn_start: '다음 턴 시작까지',
    target_turn_end: '다음 턴 종료까지',
    source_turn_start: '시전자 턴 시작까지',
    source_turn_end: '시전자 턴 종료까지',
    manual: '수동 해제까지',
  };
  if (condition.duration_mode === 'rounds') {
    const left = remainingRounds(condition, currentRound);
    return left === null ? '' : `${left}라운드 남음`;
  }
  return labels[condition.duration_mode];
}

/**
 * 주어진 턴 이벤트에서 만료되는 상태 효과를 찾는다.
 * 반환값은 만료된 효과 목록이며, 호출자가 제거하거나 DM에게 확인을 요청한다.
 */
export function expiredConditions(
  conditions: readonly ConditionLike[],
  event: TurnEvent,
): ConditionLike[] {
  return conditions.filter((c) => {
    switch (c.duration_mode) {
      case 'manual':
        return false;
      case 'rounds': {
        // 라운드 효과는 대상의 턴 시작 시 감소·만료한다.
        if (event.phase !== 'start' || c.combatant_id !== event.combatantId) return false;
        return (remainingRounds(c, event.round) ?? 0) <= 0;
      }
      case 'target_turn_start':
        return event.phase === 'start' && c.combatant_id === event.combatantId && event.round > c.started_round;
      case 'target_turn_end':
        return event.phase === 'end' && c.combatant_id === event.combatantId && event.round >= c.started_round;
      case 'source_turn_start':
        return (
          event.phase === 'start' &&
          c.source_combatant_id === event.combatantId &&
          event.round > c.started_round
        );
      case 'source_turn_end':
        return (
          event.phase === 'end' &&
          c.source_combatant_id === event.combatantId &&
          event.round >= c.started_round
        );
      default:
        return false;
    }
  });
}

/**
 * 턴이 A에서 B로 넘어갈 때 발생하는 이벤트 쌍(A의 턴 종료 → B의 턴 시작)에서
 * 만료되는 모든 효과를 모은다.
 */
export function expiredOnTurnChange(
  conditions: readonly ConditionLike[],
  params: { endingCombatantId: string | null; endingRound: number; startingCombatantId: string | null; startingRound: number },
): ConditionLike[] {
  const result = new Map<string, ConditionLike>();
  if (params.endingCombatantId) {
    for (const c of expiredConditions(conditions, {
      phase: 'end',
      combatantId: params.endingCombatantId,
      round: params.endingRound,
    })) {
      result.set(c.id, c);
    }
  }
  if (params.startingCombatantId) {
    for (const c of expiredConditions(conditions, {
      phase: 'start',
      combatantId: params.startingCombatantId,
      round: params.startingRound,
    })) {
      result.set(c.id, c);
    }
  }
  return [...result.values()];
}
