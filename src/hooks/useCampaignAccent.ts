import { useEffect } from 'react';
import { isHexColor, readableForeground } from '@/features/campaigns/themeColor';

/**
 * 캠페인 강조 색상을 화면에 적용한다.
 *
 * 캠페인 화면을 벗어나면 원래 색으로 되돌린다. 그래서 인라인 스타일로 덮어쓰고
 * 정리 단계에서 지우는 방식을 쓴다(스타일시트 값을 건드리지 않는다).
 *
 * 색은 `#rrggbb` 형식만 통과시킨다. 검증하지 않고 CSS 변수에 넣으면
 * 저장된 문자열이 그대로 스타일에 들어가므로 값을 좁혀 둔다.
 */
export function useCampaignAccent(color: string | null | undefined): void {
  useEffect(() => {
    if (!isHexColor(color)) return;

    const root = document.documentElement;
    const previousAccent = root.style.getPropertyValue('--color-accent');
    const previousFg = root.style.getPropertyValue('--color-accent-fg');

    root.style.setProperty('--color-accent', color);
    root.style.setProperty('--color-accent-fg', readableForeground(color));

    return () => {
      if (previousAccent) root.style.setProperty('--color-accent', previousAccent);
      else root.style.removeProperty('--color-accent');

      if (previousFg) root.style.setProperty('--color-accent-fg', previousFg);
      else root.style.removeProperty('--color-accent-fg');
    };
  }, [color]);
}
