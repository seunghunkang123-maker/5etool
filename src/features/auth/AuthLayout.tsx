import type { ReactNode } from 'react';
import { Swords } from 'lucide-react';
import { isDemoMode } from '@/data';

export function AuthLayout({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--color-surface-2)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]">
            <Swords aria-hidden className="h-6 w-6 text-[var(--color-accent-fg)]" />
          </span>
          <h1 className="text-xl font-semibold text-[var(--color-fg)]">Arcanum Table</h1>
          <p className="text-sm text-[var(--color-fg-muted)]">D&amp;D 5e를 위한 TRPG 세션 운영 도구</p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--color-fg)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[var(--color-fg-muted)]">{description}</p> : null}
          <div className="mt-5">{children}</div>
        </div>

        {footer ? <div className="mt-4 text-center text-sm text-[var(--color-fg-muted)]">{footer}</div> : null}

        {isDemoMode ? (
          <p className="mt-6 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-center text-xs text-[var(--color-fg-muted)]">
            <strong className="text-[var(--color-warning)]">데모 모드</strong>로 실행 중입니다. 계정과 데이터는 이 브라우저에만
            저장되며 서버로 전송되지 않습니다. 운영 환경에서는 Supabase 인증을 사용하세요.
          </p>
        ) : null}
      </div>
    </div>
  );
}
