/**
 * 주문 집중(Concentration) 규칙.
 */

/**
 * 집중 유지 내성 굴림 난이도.
 * 기본 10, 받은 피해의 절반이 10보다 크면 그 값을 사용한다.
 */
export function concentrationDC(damage: number): number {
  const dmg = Math.max(0, Math.floor(damage || 0));
  return Math.max(10, Math.floor(dmg / 2));
}

export interface ConcentrationCheck {
  required: boolean;
  dc: number;
  reason: string;
}

/** 피해를 받았을 때 집중 굴림이 필요한지 판정한다. */
export function evaluateConcentration(params: {
  isConcentrating: boolean;
  damage: number;
  droppedToZero: boolean;
}): ConcentrationCheck {
  const { isConcentrating, damage, droppedToZero } = params;
  if (!isConcentrating || damage <= 0) {
    return { required: false, dc: 0, reason: '' };
  }
  if (droppedToZero) {
    return { required: false, dc: 0, reason: 'HP가 0이 되어 집중이 자동으로 종료됩니다.' };
  }
  const dc = concentrationDC(damage);
  return {
    required: true,
    dc,
    reason: `피해 ${damage} → 건강 내성 DC ${dc}`,
  };
}
