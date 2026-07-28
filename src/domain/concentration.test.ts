import { describe, expect, it } from 'vitest';
import { concentrationDC, evaluateConcentration } from './concentration';

describe('concentrationDC', () => {
  it('기본 난이도는 10이다', () => {
    expect(concentrationDC(1)).toBe(10);
    expect(concentrationDC(10)).toBe(10);
    expect(concentrationDC(20)).toBe(10);
  });

  it('피해의 절반이 10보다 크면 그 값을 쓴다', () => {
    expect(concentrationDC(21)).toBe(10);
    expect(concentrationDC(22)).toBe(11);
    expect(concentrationDC(45)).toBe(22);
    expect(concentrationDC(100)).toBe(50);
  });

  it('절반은 내림 처리한다', () => {
    expect(concentrationDC(23)).toBe(11);
    expect(concentrationDC(25)).toBe(12);
  });

  it('음수와 0을 안전하게 처리한다', () => {
    expect(concentrationDC(0)).toBe(10);
    expect(concentrationDC(-5)).toBe(10);
  });
});

describe('evaluateConcentration', () => {
  it('집중 중이 아니면 굴림이 필요 없다', () => {
    expect(evaluateConcentration({ isConcentrating: false, damage: 30, droppedToZero: false }).required).toBe(false);
  });

  it('집중 중에 피해를 받으면 굴림이 필요하다', () => {
    const result = evaluateConcentration({ isConcentrating: true, damage: 30, droppedToZero: false });
    expect(result.required).toBe(true);
    expect(result.dc).toBe(15);
    expect(result.reason).toContain('DC 15');
  });

  it('HP가 0이 되면 집중이 자동 종료된다', () => {
    const result = evaluateConcentration({ isConcentrating: true, damage: 30, droppedToZero: true });
    expect(result.required).toBe(false);
    expect(result.reason).toContain('자동으로 종료');
  });

  it('피해가 0이면 굴림이 필요 없다', () => {
    expect(evaluateConcentration({ isConcentrating: true, damage: 0, droppedToZero: false }).required).toBe(false);
  });
});
