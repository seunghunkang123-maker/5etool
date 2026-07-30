/**
 * 캠페인 강조 색상.
 *
 * 캠페인 안에 있는 동안 앱의 강조 색을 그 캠페인 색으로 바꾼다.
 * 여러 캠페인을 오가는 DM이 지금 어느 캠페인에 있는지 색으로 구분할 수 있게 하는 것이 목적이다.
 */

export const THEME_COLORS = [
  '#7c3aed',
  '#0f766e',
  '#b91c1c',
  '#1d4ed8',
  '#a16207',
  '#4d7c0f',
  '#be185d',
  '#0e7490',
] as const;

export const THEME_COLOR_LABELS: Record<string, string> = {
  '#7c3aed': '보라',
  '#0f766e': '청록',
  '#b91c1c': '붉은색',
  '#1d4ed8': '파랑',
  '#a16207': '황토',
  '#4d7c0f': '올리브',
  '#be185d': '자홍',
  '#0e7490': '하늘',
};

/** `#rrggbb` 형식만 통과시킨다. CSS 변수에 넣기 전 검증한다. */
export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function channels(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * 배경색 위에 놓을 글자색을 고른다. WCAG 상대 휘도로 판단한다.
 * 밝은 강조색에 흰 글자를 쓰면 대비가 모자라 읽기 어려워진다.
 */
export function readableForeground(hex: string): '#ffffff' | '#111111' {
  const [r, g, b] = channels(hex);
  const linear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  // 흰색(1.05) 대비와 검정(0.05) 대비를 비교해 더 잘 보이는 쪽을 쓴다.
  const withWhite = 1.05 / (luminance + 0.05);
  const withBlack = (luminance + 0.05) / 0.05;
  return withWhite >= withBlack ? '#ffffff' : '#111111';
}
