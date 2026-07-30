import { cn } from '@/lib/cn';

/**
 * 프로필 이미지.
 * 이미지가 없으면 표시 이름의 첫 글자를 보여준다.
 *
 * 접근성: 이 컴포넌트는 장식용이다. 옆에 이름 텍스트가 함께 놓이는 자리에만 쓰고,
 * 이미지에 이름을 중복해서 읽히지 않도록 alt를 비운다.
 * 이름 텍스트가 없는 자리에서는 `label`을 넘겨 접근 가능한 이름을 준다.
 */

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-sm',
  lg: 'h-12 w-12 text-lg',
  xl: 'h-20 w-20 text-2xl',
} as const;

export function Avatar({
  url,
  name,
  size = 'md',
  label,
  className,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  label?: string;
  className?: string;
}) {
  const initial = (name ?? '?').trim().slice(0, 1) || '?';
  const shared = cn(
    'shrink-0 overflow-hidden rounded-full object-cover',
    SIZES[size],
    className,
  );

  if (url) {
    return (
      <img
        src={url}
        alt={label ?? ''}
        loading="lazy"
        decoding="async"
        className={cn(shared, 'bg-[var(--color-surface-3)]')}
      />
    );
  }

  return (
    <span
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={cn(
        shared,
        'flex items-center justify-center bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]',
      )}
    >
      {initial}
    </span>
  );
}
