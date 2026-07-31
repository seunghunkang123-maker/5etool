import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * 카드 대표 이미지.
 *
 * 몬스터 초상화는 세로로 길고, 지도는 가로로 넓다. 고정 높이에 object-cover를 쓰면
 * 세로 이미지의 얼굴이 잘리고 가로 이미지는 양옆이 사라진다.
 * 그래서 이미지가 실제로 어떤 비율인지 확인한 뒤 레이아웃을 맞춘다.
 *
 * - 가로가 긴 이미지: 폭을 채우고 비율대로 높이를 정한다.
 * - 세로가 긴 이미지: 최대 높이 안에 전체가 들어오도록 맞추고 가운데 정렬한다.
 * - 비율을 알기 전에는 최소 높이만 잡아 레이아웃이 튀지 않게 한다.
 *
 * 어느 경우에도 잘리지 않는다(object-contain). 남는 공간은 배경으로 채운다.
 */
export function CardImage({
  src,
  alt,
  maxHeight = 320,
  minHeight = 96,
  className,
  onClick,
  clickLabel,
}: {
  src: string;
  alt: string;
  /** 세로로 긴 이미지가 화면을 다 잡아먹지 않도록 하는 상한 (px) */
  maxHeight?: number;
  minHeight?: number;
  className?: string;
  onClick?: () => void;
  /** 클릭 가능한 경우의 접근 가능한 이름 */
  clickLabel?: string;
}) {
  const [ratio, setRatio] = useState<number | null>(null);

  // 가로:세로 비율. 1보다 크면 가로가 길다.
  const isWide = ratio !== null && ratio >= 1;

  const image = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
      }}
      className="max-h-full max-w-full object-contain"
      style={ratio === null ? { maxHeight } : undefined}
    />
  );

  return (
    <div
      className={cn(
        'flex items-center justify-center overflow-hidden rounded-lg bg-[var(--color-surface-3)]',
        onClick && 'cursor-zoom-in',
        className,
      )}
      style={{
        // 비율을 알면 그대로 쓰되, 세로 이미지는 최대 높이로 제한한다.
        ...(isWide ? { aspectRatio: String(ratio) } : {}),
        maxHeight,
        minHeight: ratio === null ? minHeight : undefined,
      }}
      {...(onClick
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': clickLabel,
            onClick,
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      {image}
    </div>
  );
}
