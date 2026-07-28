import type { Combatant, TiebreakRule } from '@/data/types';

/**
 * 이니셔티브 정렬과 턴 진행 규칙.
 */

export interface TurnState {
  round: number;
  activeCombatantId: string | null;
}

/**
 * 이니셔티브 내림차순 정렬.
 * 동점 기준(기본): 1) 민첩 수정치 2) 민첩 수치 3) DM 지정값(initiative_tiebreak)
 * 그래도 같으면 안정적인 순서를 위해 sort_order → id 순으로 정렬한다.
 */
export function sortByInitiative<T extends Pick<Combatant, 'id' | 'initiative' | 'dex_mod' | 'dex_score' | 'initiative_tiebreak' | 'sort_order'>>(
  combatants: readonly T[],
  rule: TiebreakRule = 'dex_mod',
): T[] {
  return [...combatants].sort((a, b) => {
    const ai = a.initiative ?? Number.NEGATIVE_INFINITY;
    const bi = b.initiative ?? Number.NEGATIVE_INFINITY;
    if (ai !== bi) return bi - ai;

    if (rule === 'dex_mod' || rule === 'dex_score') {
      if (rule === 'dex_mod' && a.dex_mod !== b.dex_mod) return b.dex_mod - a.dex_mod;
      if (a.dex_score !== b.dex_score) return b.dex_score - a.dex_score;
    }

    if (a.initiative_tiebreak !== b.initiative_tiebreak) {
      return b.initiative_tiebreak - a.initiative_tiebreak;
    }
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id.localeCompare(b.id);
  });
}

/** 턴 진행에 참여하는 대상: 이니셔티브가 입력된 참가자 */
export function turnOrder<T extends Pick<Combatant, 'id' | 'initiative' | 'dex_mod' | 'dex_score' | 'initiative_tiebreak' | 'sort_order'>>(
  combatants: readonly T[],
  rule: TiebreakRule = 'dex_mod',
): T[] {
  return sortByInitiative(combatants.filter((c) => c.initiative !== null), rule);
}

/**
 * 다음 턴. 마지막 참가자의 턴이 끝나면 라운드가 1 증가하고 첫 참가자로 돌아간다.
 */
export function nextTurn(order: readonly { id: string }[], state: TurnState): TurnState {
  if (order.length === 0) return state;
  const index = order.findIndex((c) => c.id === state.activeCombatantId);

  // 아직 전투가 시작되지 않았거나 활성 참가자가 목록에서 사라진 경우 → 첫 참가자
  if (index === -1) {
    return { round: Math.max(1, state.round), activeCombatantId: order[0]?.id ?? null };
  }
  const isLast = index === order.length - 1;
  return {
    round: isLast ? state.round + 1 : state.round,
    activeCombatantId: (isLast ? order[0]?.id : order[index + 1]?.id) ?? null,
  };
}

/**
 * 이전 턴. 첫 참가자에서 되돌리면 라운드가 1 감소한다(최소 1).
 */
export function previousTurn(order: readonly { id: string }[], state: TurnState): TurnState {
  if (order.length === 0) return state;
  const index = order.findIndex((c) => c.id === state.activeCombatantId);
  if (index === -1) {
    return { round: Math.max(1, state.round), activeCombatantId: order[0]?.id ?? null };
  }
  const isFirst = index === 0;
  if (isFirst && state.round <= 1) {
    // 1라운드 첫 참가자보다 이전으로는 갈 수 없다.
    return { round: 1, activeCombatantId: order[0]?.id ?? null };
  }
  return {
    round: isFirst ? state.round - 1 : state.round,
    activeCombatantId: (isFirst ? order[order.length - 1]?.id : order[index - 1]?.id) ?? null,
  };
}

/** 이니셔티브 굴림값 = d20 + 보너스 */
export function rollInitiativeValue(d20: number, bonus: number): number {
  return d20 + bonus;
}

/**
 * "고블린" → "고블린 1", "고블린 2" 처럼 중복 이름을 구분한다.
 * 이미 존재하는 이름 목록을 받아 다음 번호를 붙인다.
 */
export function uniqueCombatantName(baseName: string, existingNames: readonly string[]): string {
  const base = baseName.trim();
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`);

  const matches = existingNames.filter((n) => pattern.test(n.trim()));
  if (matches.length === 0) return base;

  let maxIndex = 1;
  for (const name of matches) {
    const m = pattern.exec(name.trim());
    const num = m?.[1] ? Number(m[1]) : 1;
    if (num > maxIndex) maxIndex = num;
  }
  return `${base} ${maxIndex + 1}`;
}

/**
 * 같은 이름의 첫 참가자가 번호 없이 남아 있으면 "이름 1"로 정규화한다.
 * (고블린, 고블린 2 → 고블린 1, 고블린 2)
 */
export function normalizeDuplicateNames(names: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    const base = name.replace(/\s+\d+$/, '').trim();
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return names.map((name) => {
    const base = name.replace(/\s+\d+$/, '').trim();
    if ((counts.get(base) ?? 0) > 1 && !/\s+\d+$/.test(name)) return `${base} 1`;
    return name;
  });
}
