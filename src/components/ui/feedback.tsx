import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

/** 로딩 · 빈 화면 · 오류 상태를 위한 공통 표현 */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-soft-pulse rounded-md bg-[var(--color-surface-3)]', className)} />;
}

export function LoadingBlock({ label = '불러오는 중입니다' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 p-8 text-[var(--color-fg-muted)]">
      <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  /** 다음에 할 행동을 안내한다. */
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon ? <div className="text-[var(--color-fg-muted)]">{icon}</div> : null}
      <div>
        <p className="font-medium text-[var(--color-fg)]">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-sm text-[var(--color-fg-muted)]">{description}</p> : null}
      </div>
      {action ? (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({ message, onRetry, retrying }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-[var(--color-fg)]">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry} loading={retrying}>
          다시 시도
        </Button>
      ) : null}
    </div>
  );
}

export function Badge({ children, tone = 'default', className }: { children: ReactNode; tone?: 'default' | 'accent' | 'danger' | 'success' | 'warning'; className?: string }) {
  const tones = {
    default: 'bg-[var(--color-surface-3)] text-[var(--color-fg-muted)]',
    accent: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
    danger: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]',
    success: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>
      {children}
    </span>
  );
}
