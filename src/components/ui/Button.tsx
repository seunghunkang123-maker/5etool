import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** 아이콘 전용 버튼에는 반드시 접근 가능한 이름을 준다. */
  'aria-label'?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50',
  secondary:
    'bg-[var(--color-surface-2)] text-[var(--color-fg)] border border-[var(--color-border)] hover:bg-[var(--color-surface-3)] disabled:opacity-50',
  ghost: 'text-[var(--color-fg)] hover:bg-[var(--color-surface-2)] disabled:opacity-50',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50',
  subtle: 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-2)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1',
  md: 'h-10 px-3.5 text-sm gap-1.5',
  lg: 'h-12 px-5 text-base gap-2',
  // 터치 대상 최소 크기(44px)를 만족한다.
  icon: 'h-11 w-11 justify-center',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading = false, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center rounded-lg font-medium transition-colors select-none',
        'disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
