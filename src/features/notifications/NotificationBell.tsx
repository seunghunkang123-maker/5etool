import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNotifications } from '@/hooks/queries';
import { qk } from '@/hooks/queries';
import { useQueryClient } from '@tanstack/react-query';
import { repo } from '@/data';
import { formatRelative } from '@/lib/format';
import { EmptyState } from '@/components/ui/feedback';
import { NOTIFICATION_TYPE_LABELS } from '@/data/types';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data: notifications = [] } = useNotifications();
  const client = useQueryClient();
  const unread = notifications.filter((n) => !n.read_at);

  const markAll = async () => {
    await repo().notifications.markAllRead();
    void client.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={unread.length > 0 ? `알림 ${unread.length}개 (읽지 않음)` : '알림'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell aria-hidden className="h-5 w-5" />
        {unread.length > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        ) : null}
      </Button>

      {open ? (
        <>
          <button type="button" aria-label="알림 닫기" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 flex max-h-96 w-80 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
              <h2 className="text-sm font-semibold">알림</h2>
              {unread.length > 0 ? (
                <Button variant="subtle" size="sm" onClick={markAll}>
                  <CheckCheck aria-hidden className="h-4 w-4" />
                  모두 읽음
                </Button>
              ) : null}
            </div>

            <div className="scroll-area flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <EmptyState title="알림이 없습니다" description="세션이 시작되거나 자료가 공개되면 여기에 표시됩니다." />
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {notifications.map((item) => (
                    <li key={item.id} className={item.read_at ? 'opacity-60' : ''}>
                      <div className="px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--color-fg)]">{item.title}</p>
                          <time className="shrink-0 text-xs text-[var(--color-fg-muted)]">{formatRelative(item.created_at)}</time>
                        </div>
                        <p className="mt-0.5 text-sm text-[var(--color-fg-muted)]">{item.body}</p>
                        <p className="mt-1 text-[11px] text-[var(--color-fg-muted)]">{NOTIFICATION_TYPE_LABELS[item.type]}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
