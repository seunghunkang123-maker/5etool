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
  /** 한 줄 요약. 배지 옆이나 좁은 자리에 쓴다. */
  description: string;
  /** 조회 창에서 보여줄 세부 규칙. */
  details: string[];
  /** 검색용 별칭 (영문 표기 등). */
  aliases?: string[];
  /** 누적되는 상태인지 */
  isStackable?: boolean;
}

export const DND5E_CONDITIONS: ConditionTemplate[] = [
  {
    key: 'blinded',
    name: '장님',
    icon: 'eye-off',
    description: '볼 수 없다. 공격에 불리점, 자신을 향한 공격에 이점.',
    aliases: ['blinded'],
    details: [
      '앞을 볼 수 없으며, 시각에 의존하는 능력 판정에 자동으로 실패한다.',
      '자신의 공격 굴림에 불리점을 받는다.',
      '자신을 향한 공격 굴림은 이점을 받는다.',
    ],
  },
  {
    key: 'charmed',
    name: '매혹',
    icon: 'heart',
    description: '매혹한 자를 공격할 수 없다.',
    aliases: ['charmed'],
    details: [
      '자신을 매혹한 자를 공격하거나, 그를 해로운 능력·마법 효과의 대상으로 삼을 수 없다.',
      '매혹한 자는 대상과의 사회적 상호작용 능력 판정에 이점을 받는다.',
    ],
  },
  {
    key: 'deafened',
    name: '귀머거리',
    icon: 'ear-off',
    description: '들을 수 없다.',
    aliases: ['deafened'],
    details: ['들을 수 없으며, 청각에 의존하는 능력 판정에 자동으로 실패한다.'],
  },
  {
    key: 'frightened',
    name: '공포',
    icon: 'ghost',
    description: '근원이 보이면 판정에 불리점. 다가갈 수 없다.',
    aliases: ['frightened'],
    details: [
      '공포의 근원이 시야에 있는 동안 능력 판정과 공격 굴림에 불리점을 받는다.',
      '자발적으로 공포의 근원에게 가까워지도록 이동할 수 없다.',
    ],
  },
  {
    key: 'grappled',
    name: '붙잡힘',
    icon: 'grab',
    description: '이동 속도가 0이 된다.',
    aliases: ['grappled'],
    details: [
      '이동 속도가 0이 되며, 속도 증가 효과를 받을 수 없다.',
      '붙잡은 자가 행동 불능이 되면 즉시 해제된다.',
      '붙잡은 자의 간격 밖으로 밀려나는 등 거리가 벌어지면 해제된다.',
    ],
  },
  {
    key: 'incapacitated',
    name: '행동 불능',
    icon: 'ban',
    description: '행동과 반응을 할 수 없다.',
    aliases: ['incapacitated'],
    details: ['행동, 추가 행동, 반응을 할 수 없다.'],
  },
  {
    key: 'invisible',
    name: '투명',
    icon: 'eye-closed',
    description: '보이지 않는다. 공격에 이점, 자신을 향한 공격에 불리점.',
    aliases: ['invisible'],
    details: [
      '특수한 감각이나 마법 없이는 볼 수 없다. 은신 판정에서 심하게 가려진 것으로 친다.',
      '소리와 흔적으로 위치를 짐작할 수는 있다.',
      '자신의 공격 굴림에 이점, 자신을 향한 공격 굴림에 불리점.',
    ],
  },
  {
    key: 'paralyzed',
    name: '마비',
    icon: 'zap-off',
    description: '행동 불능. 근접 공격은 자동 치명타.',
    aliases: ['paralyzed'],
    details: [
      '행동 불능 상태이며, 움직이거나 말할 수 없다.',
      '힘과 민첩 내성 굴림에 자동으로 실패한다.',
      '자신을 향한 공격 굴림은 이점을 받는다.',
      '1.5m 이내에서 명중한 공격은 자동으로 치명타가 된다.',
    ],
  },
  {
    key: 'petrified',
    name: '석화',
    icon: 'gem',
    description: '무생물로 변한다. 모든 피해에 저항.',
    aliases: ['petrified'],
    details: [
      '자신과 지닌 물건이 무생물 물질로 변한다. 무게가 10배가 되고 나이를 먹지 않는다.',
      '행동 불능이며 움직이거나 말할 수 없고 주변을 인지하지 못한다.',
      '자신을 향한 공격 굴림은 이점을 받는다.',
      '힘과 민첩 내성 굴림에 자동으로 실패한다.',
      '모든 피해에 저항하며, 독과 질병에 면역이다. (이미 걸린 것은 유예될 뿐이다)',
    ],
  },
  {
    key: 'poisoned',
    name: '중독',
    icon: 'flask-conical',
    description: '공격 굴림과 능력 판정에 불리점.',
    aliases: ['poisoned'],
    details: ['공격 굴림과 능력 판정에 불리점을 받는다.'],
  },
  {
    key: 'prone',
    name: '넘어짐',
    icon: 'arrow-down',
    description: '포복만 가능. 근접 공격에 이점, 원거리 공격에 불리점.',
    aliases: ['prone'],
    details: [
      '포복으로만 이동할 수 있다. 일어서려면 이동력의 절반을 쓴다.',
      '자신의 공격 굴림에 불리점을 받는다.',
      '자신을 향한 공격은 1.5m 이내라면 이점, 그보다 멀면 불리점을 받는다.',
    ],
  },
  {
    key: 'restrained',
    name: '구속',
    icon: 'link',
    description: '이동 속도 0. 민첩 내성에 불리점.',
    aliases: ['restrained'],
    details: [
      '이동 속도가 0이 되며, 속도 증가 효과를 받을 수 없다.',
      '자신의 공격 굴림에 불리점, 자신을 향한 공격 굴림에 이점.',
      '민첩 내성 굴림에 불리점을 받는다.',
    ],
  },
  {
    key: 'stunned',
    name: '기절',
    icon: 'star',
    description: '행동 불능. 힘·민첩 내성 자동 실패.',
    aliases: ['stunned'],
    details: [
      '행동 불능이며 움직일 수 없고 말은 더듬거리며 겨우 할 수 있다.',
      '힘과 민첩 내성 굴림에 자동으로 실패한다.',
      '자신을 향한 공격 굴림은 이점을 받는다.',
    ],
  },
  {
    key: 'unconscious',
    name: '의식 불명',
    icon: 'moon',
    description: '행동 불능이자 넘어짐. 근접 공격은 자동 치명타.',
    aliases: ['unconscious'],
    details: [
      '행동 불능이며 움직이거나 말할 수 없고 주변을 인지하지 못한다.',
      '들고 있던 것을 떨어뜨리고 넘어진 상태가 된다.',
      '힘과 민첩 내성 굴림에 자동으로 실패한다.',
      '자신을 향한 공격 굴림은 이점을 받는다.',
      '1.5m 이내에서 명중한 공격은 자동으로 치명타가 된다.',
    ],
  },
  {
    key: 'exhaustion',
    name: '탈진',
    icon: 'battery-low',
    description: '1~6단계로 누적된다. 6단계는 사망.',
    aliases: ['exhaustion'],
    isStackable: true,
    details: [
      '1단계 — 능력 판정에 불리점.',
      '2단계 — 이동 속도 절반.',
      '3단계 — 공격 굴림과 내성 굴림에 불리점.',
      '4단계 — 최대 hp 절반.',
      '5단계 — 이동 속도 0.',
      '6단계 — 사망.',
      '긴 휴식을 마치면 1단계 감소한다. 이때 음식과 물을 섭취해야 한다.',
    ],
  },
  {
    key: 'concentrating',
    name: '집중',
    icon: 'brain',
    description: '피해를 받으면 건강 내성이 필요하다.',
    aliases: ['concentration'],
    details: [
      '한 번에 하나의 주문에만 집중할 수 있다. 새로 집중하면 이전 것은 즉시 끝난다.',
      '피해를 받으면 건강 내성 굴림을 해야 한다. 난이도는 10과 받은 피해의 절반 중 높은 값이다.',
      '행동 불능이 되거나 사망하면 집중이 끊긴다.',
    ],
  },
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
