import { create } from 'zustand';
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * 접근 가능한 Toast.
 * 브라우저 alert 대신 사용하며, 스크린 리더에는 live region으로 전달한다.
 */

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** 사용자가 다음에 할 수 있는 행동을 안내 */
  action?: { label: string; onClick: () => void };
  duration: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const item: ToastItem = { duration: toast.kind === 'error' ? 7000 : 4000, ...toast, id };
    set((state) => ({ toasts: [...state.toasts, item].slice(-4) }));
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'success', message, action }),
  error: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'error', message, action }),
  info: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'info', message, action }),
  warning: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'warning', message, action }),
};

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

const STYLES: Record<ToastKind, string> = {
  success: 'border-[var(--color-success)]',
  error: 'border-[var(--color-danger)]',
  info: 'border-[var(--color-border)]',
  warning: 'border-[var(--color-warning)]',
};

const ICON_COLORS: Record<ToastKind, string> = {
  success: 'text-[var(--color-success)]',
  error: 'text-[var(--color-danger)]',
  info: 'text-[var(--color-accent)]',
  warning: 'text-[var(--color-warning)]',
};

function ToastRow({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[item.kind];

  useEffect(() => {
    if (item.duration <= 0) return;
    const timer = window.setTimeout(() => dismiss(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, dismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border-l-4 bg-[var(--color-surface-2)]',
        'border border-[var(--color-border)] px-3.5 py-3 shadow-lg',
        STYLES[item.kind],
      )}
    >
      <Icon aria-hidden className={cn('mt-0.5 h-5 w-5 shrink-0', ICON_COLORS[item.kind])} />
      <p className="flex-1 text-sm text-[var(--color-fg)]">{item.message}</p>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismiss(item.id);
          }}
          className="shrink-0 text-sm font-semibold text-[var(--color-accent)] underline"
        >
          {item.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="알림 닫기"
        className="shrink-0 rounded p-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      role="region"
      aria-label="알림"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[60] flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-96"
    >
      <div aria-live="polite" aria-atomic="false" className="flex flex-col gap-2">
        {toasts.map((item) => (
          <ToastRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
