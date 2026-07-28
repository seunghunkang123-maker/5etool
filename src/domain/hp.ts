/**
 * HP 계산 규칙 (D&D 5e).
 * 모든 함수는 순수하며 입력을 변경하지 않는다.
 */

export interface HpState {
  hp: number;
  maxHp: number;
  tempHp: number;
}

export interface DamageResult extends HpState {
  /** 임시 HP에서 흡수된 양 */
  absorbedByTemp: number;
  /** 실제 HP에서 차감된 양 */
  appliedToHp: number;
  /** 이번 변경으로 HP가 0이 되었는가 */
  droppedToZero: boolean;
}

function sanitize(state: HpState): HpState {
  const maxHp = Math.max(0, Math.floor(state.maxHp || 0));
  const hp = Math.min(maxHp, Math.max(0, Math.floor(state.hp || 0)));
  const tempHp = Math.max(0, Math.floor(state.tempHp || 0));
  return { hp, maxHp, tempHp };
}

/**
 * 피해 적용.
 * 1) 임시 HP를 먼저 차감한다.
 * 2) 남은 피해를 현재 HP에서 차감한다.
 * 3) 현재 HP는 0 미만이 되지 않는다.
 */
export function applyDamage(state: HpState, rawAmount: number): DamageResult {
  const s = sanitize(state);
  const amount = Math.max(0, Math.floor(rawAmount || 0));

  const absorbedByTemp = Math.min(s.tempHp, amount);
  const remaining = amount - absorbedByTemp;
  const appliedToHp = Math.min(s.hp, remaining);
  const hp = s.hp - appliedToHp;

  return {
    hp,
    maxHp: s.maxHp,
    tempHp: s.tempHp - absorbedByTemp,
    absorbedByTemp,
    appliedToHp,
    droppedToZero: hp === 0 && s.hp > 0,
  };
}

/** 회복 적용. 현재 HP는 최대 HP를 넘지 않는다. 전투 불능(0)에서도 회복 가능. */
export function applyHealing(state: HpState, rawAmount: number): HpState & { healed: number } {
  const s = sanitize(state);
  const amount = Math.max(0, Math.floor(rawAmount || 0));
  const hp = Math.min(s.maxHp, s.hp + amount);
  return { ...s, hp, healed: hp - s.hp };
}

/**
 * 임시 HP 설정.
 * 5e 규칙상 임시 HP는 누적되지 않고 더 높은 값으로 대체한다.
 */
export function setTempHp(state: HpState, rawAmount: number, mode: 'replace_if_higher' | 'force' = 'replace_if_higher'): HpState {
  const s = sanitize(state);
  const amount = Math.max(0, Math.floor(rawAmount || 0));
  if (mode === 'force') return { ...s, tempHp: amount };
  return { ...s, tempHp: Math.max(s.tempHp, amount) };
}

/** 최대 HP 변경. 현재 HP가 최대치를 넘으면 함께 낮춘다. */
export function setMaxHp(state: HpState, rawMax: number): HpState {
  const maxHp = Math.max(0, Math.floor(rawMax || 0));
  const s = sanitize(state);
  return { hp: Math.min(s.hp, maxHp), maxHp, tempHp: s.tempHp };
}

export function fullHeal(state: HpState): HpState {
  const s = sanitize(state);
  return { ...s, hp: s.maxHp };
}

export function knockOut(state: HpState): HpState {
  const s = sanitize(state);
  return { ...s, hp: 0, tempHp: 0 };
}

// ── 부상 단계 ────────────────────────────────────────────────
export const HP_TIERS = ['healthy', 'bruised', 'wounded', 'critical', 'down'] as const;
export type HpTier = (typeof HP_TIERS)[number];

export const HP_TIER_LABELS: Record<HpTier, string> = {
  healthy: '정상',
  bruised: '경미한 부상',
  wounded: '중상',
  critical: '위급',
  down: '전투 불능',
};

/**
 * HP 비율에 따른 부상 단계.
 *  75% 초과: 정상 / 50~75%: 경미한 부상 / 25~50%: 중상 / 1~25%: 위급 / 0: 전투 불능
 */
export function hpTier(hp: number, maxHp: number): HpTier {
  if (maxHp <= 0) return hp > 0 ? 'healthy' : 'down';
  if (hp <= 0) return 'down';
  const ratio = (hp / maxHp) * 100;
  if (ratio > 75) return 'healthy';
  if (ratio > 50) return 'bruised';
  if (ratio > 25) return 'wounded';
  return 'critical';
}

/** 광역 피해에서 대상별로 선택할 수 있는 적용 방식 */
export type AreaDamageMode = 'full' | 'half' | 'none' | 'custom';

export function resolveAreaDamage(amount: number, mode: AreaDamageMode, customValue = 0): number {
  const base = Math.max(0, Math.floor(amount || 0));
  switch (mode) {
    case 'full':
      return base;
    case 'half':
      return Math.floor(base / 2);
    case 'none':
      return 0;
    case 'custom':
      return Math.max(0, Math.floor(customValue || 0));
  }
}
