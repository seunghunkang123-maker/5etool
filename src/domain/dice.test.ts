import { describe, expect, it } from 'vitest';
import { criticalKind, DiceParseError, formatRollDetail, parseExpression, rollExpression, type RandomFn } from './dice';

/** 미리 정한 값을 순서대로 반환하는 결정적 난수 */
function fixedRandom(values: number[]): RandomFn {
  let index = 0;
  return () => values[index++ % values.length] ?? 1;
}

describe('parseExpression', () => {
  it('기본 표기법을 해석한다', () => {
    expect(parseExpression('d20')).toEqual([{ kind: 'dice', sign: 1, count: 1, sides: 20, value: 0 }]);
    expect(parseExpression('2d6')).toEqual([{ kind: 'dice', sign: 1, count: 2, sides: 6, value: 0 }]);
  });

  it('수정치를 해석한다', () => {
    const terms = parseExpression('1d20+5');
    expect(terms).toHaveLength(2);
    expect(terms[1]).toEqual({ kind: 'modifier', sign: 1, count: 0, sides: 0, value: 5 });
  });

  it('음수 수정치를 해석한다', () => {
    const terms = parseExpression('4d6-2');
    expect(terms[1]).toMatchObject({ kind: 'modifier', sign: -1, value: 2 });
  });

  it('kh/kl 표기를 해석한다', () => {
    expect(parseExpression('2d20kh1')[0]).toMatchObject({ count: 2, sides: 20, keep: { mode: 'kh', n: 1 } });
    expect(parseExpression('2d20kl1')[0]).toMatchObject({ keep: { mode: 'kl', n: 1 } });
  });

  it('공백과 대소문자를 무시한다', () => {
    expect(parseExpression(' 2D6 + 3 ')).toHaveLength(2);
  });

  it('여러 주사위 항을 결합한다', () => {
    expect(parseExpression('1d8+1d6+3')).toHaveLength(3);
  });

  it('잘못된 식은 DiceParseError를 던진다', () => {
    expect(() => parseExpression('')).toThrow(DiceParseError);
    expect(() => parseExpression('안녕하세요')).toThrow(DiceParseError);
    expect(() => parseExpression('d')).toThrow(DiceParseError);
    expect(() => parseExpression('1d0')).toThrow(DiceParseError);
  });

  it('과도한 주사위 개수와 면수를 거부한다', () => {
    expect(() => parseExpression('101d6')).toThrow(/1~100/);
    expect(() => parseExpression('1d1001')).toThrow(/2~1000/);
  });

  it('kh 값이 주사위 개수보다 크면 거부한다', () => {
    expect(() => parseExpression('2d20kh3')).toThrow(DiceParseError);
  });

  it('지나치게 긴 식을 거부한다', () => {
    expect(() => parseExpression('1d6+'.repeat(40) + '1')).toThrow(/100자/);
  });
});

describe('rollExpression', () => {
  it('주사위 합과 수정치를 더한다', () => {
    const result = rollExpression('2d6+3', fixedRandom([4, 5]));
    expect(result.total).toBe(12);
    expect(result.detail.groups[0]?.rolls).toEqual([4, 5]);
    expect(result.detail.modifier).toBe(3);
  });

  it('kh1은 가장 높은 값만 남긴다 (이점)', () => {
    const result = rollExpression('2d20kh1', fixedRandom([7, 18]));
    expect(result.detail.groups[0]?.kept).toEqual([18]);
    expect(result.total).toBe(18);
  });

  it('kl1은 가장 낮은 값만 남긴다 (불리점)', () => {
    const result = rollExpression('2d20kl1', fixedRandom([7, 18]));
    expect(result.detail.groups[0]?.kept).toEqual([7]);
    expect(result.total).toBe(7);
  });

  it('음수 항을 뺀다', () => {
    const result = rollExpression('4d6-2', fixedRandom([3, 3, 3, 3]));
    expect(result.total).toBe(10);
  });

  it('여러 주사위 항을 합산한다', () => {
    const result = rollExpression('1d8+1d6+3', fixedRandom([8, 6]));
    expect(result.total).toBe(17);
  });

  it('결과가 이론적 범위 안에 있다', () => {
    for (let i = 0; i < 200; i += 1) {
      const { total } = rollExpression('3d6+2');
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(20);
    }
  });
});

describe('formatRollDetail', () => {
  it('굴림 내역을 사람이 읽을 수 있게 만든다', () => {
    const result = rollExpression('2d6+3', fixedRandom([4, 5]));
    expect(formatRollDetail(result.detail)).toBe('2d6[4, 5] +3');
  });

  it('버려진 주사위를 표시한다', () => {
    const result = rollExpression('2d20kh1', fixedRandom([7, 18]));
    expect(formatRollDetail(result.detail)).toBe('2d20kh1[7, 18 → 18]');
  });
});

describe('criticalKind', () => {
  it('자연 20과 자연 1을 감지한다', () => {
    expect(criticalKind(rollExpression('1d20+5', fixedRandom([20])).detail)).toBe('crit');
    expect(criticalKind(rollExpression('1d20+5', fixedRandom([1])).detail)).toBe('fumble');
    expect(criticalKind(rollExpression('1d20+5', fixedRandom([11])).detail)).toBeNull();
  });

  it('d20이 아니면 판정하지 않는다', () => {
    expect(criticalKind(rollExpression('2d6', fixedRandom([6, 6])).detail)).toBeNull();
  });
});
