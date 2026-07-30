import { describe, expect, it } from 'vitest';
import { isHexColor, readableForeground, THEME_COLOR_LABELS, THEME_COLORS } from './themeColor';

describe('isHexColor', () => {
  it('#rrggbb 형식만 통과시킨다', () => {
    expect(isHexColor('#7c3aed')).toBe(true);
    expect(isHexColor('#ABCDEF')).toBe(true);
  });

  it('CSS 변수에 넣으면 위험한 값을 막는다', () => {
    for (const bad of ['red', '#fff', '#7c3ae', 'rgb(0,0,0)', '', null, undefined, '#7c3aed; color: red']) {
      expect(isHexColor(bad)).toBe(false);
    }
  });
});

describe('readableForeground', () => {
  it('어두운 배경에는 흰 글자를 쓴다', () => {
    expect(readableForeground('#000000')).toBe('#ffffff');
    expect(readableForeground('#1d4ed8')).toBe('#ffffff');
  });

  it('밝은 배경에는 검은 글자를 쓴다', () => {
    expect(readableForeground('#ffffff')).toBe('#111111');
    expect(readableForeground('#fde047')).toBe('#111111');
  });

  it('기본 팔레트 전체가 WCAG AA(4.5:1)를 넘는 글자색을 얻는다', () => {
    const luminance = (hex: string): number => {
      const linear = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const r = linear(Number.parseInt(hex.slice(1, 3), 16));
      const g = linear(Number.parseInt(hex.slice(3, 5), 16));
      const b = linear(Number.parseInt(hex.slice(5, 7), 16));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    for (const color of THEME_COLORS) {
      const fg = readableForeground(color);
      const bgL = luminance(color);
      const fgL = fg === '#ffffff' ? 1 : luminance('#111111');
      const ratio = (Math.max(bgL, fgL) + 0.05) / (Math.min(bgL, fgL) + 0.05);
      expect(ratio, `${color} + ${fg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('THEME_COLORS', () => {
  it('모든 색이 유효한 형식이고 한국어 이름을 가진다', () => {
    for (const color of THEME_COLORS) {
      expect(isHexColor(color)).toBe(true);
      expect(THEME_COLOR_LABELS[color]).toBeTruthy();
    }
  });

  it('중복된 색이 없다', () => {
    expect(new Set(THEME_COLORS).size).toBe(THEME_COLORS.length);
  });
});
