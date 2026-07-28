import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { repo } from '@/data';
import { qk, useSessionLogs } from '@/hooks/queries';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { formatTime } from '@/lib/format';

const EVENT_FILTERS = [
  { value: '', label: '전체' },
  { value: 'combat', label: '전투' },
  { value: 'card', label: '자료 공개' },
  { value: 'condition', label: '상태 효과' },
  { value: 'dice', label: '주사위' },
  { value: 'timer', label: '타이머' },
  { value: 'session', label: '세션' },
];

const UNDOABLE = new Set(['combat.hp', 'card.reveal']);

export function SessionLogPanel({ sessionId, canUndo }: { sessionId: string; canUndo: boolean }) {
  const client = useQueryClient();
  const [eventType, setEventType] = useState('');
  const [query, setQuery] = useState('');
  const { data: logs = [] } = useSessionLogs(sessionId, { eventType: eventType || undefined, query: query || undefined });

  const undo = async (logId: string) => {
    try {
      await repo().sessions.undoLog(logId);
      void client.invalidateQueries({ queryKey: qk.logs(sessionId) });
      void client.invalidateQueries({ queryKey: qk.encounter(sessionId) });
      toast.success('변경을 취소했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <section aria-label="세션 이벤트 로그" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">이벤트 로그</h2>

      <div className="flex gap-2">
        <label className="sr-only" htmlFor="log-filter">
          이벤트 종류
        </label>
        <Select id="log-filter" value={eventType} onChange={(e) => setEventType(e.target.value)} className="w-32">
          {EVENT_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <label className="sr-only" htmlFor="log-search">
          로그 검색
        </label>
        <Input id="log-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색" className="flex-1" />
      </div>

      <ol className="scroll-area flex max-h-72 flex-col gap-1 overflow-y-auto" aria-live="polite">
        {logs.length === 0 ? (
          <li className="py-3 text-center text-sm text-[var(--color-fg-muted)]">기록이 없습니다.</li>
        ) : (
          logs.map((log) => (
            <li key={log.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
              <time className="shrink-0 font-mono text-xs text-[var(--color-fg-muted)]">{formatTime(log.created_at)}</time>
              <span className={log.undone ? 'flex-1 text-[var(--color-fg-muted)] line-through' : 'flex-1'}>{log.message}</span>
              {canUndo && UNDOABLE.has(log.event_type) && !log.undone ? (
                <Button size="sm" variant="ghost" aria-label="이 변경 취소" onClick={() => void undo(log.id)}>
                  <Undo2 aria-hidden className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}
