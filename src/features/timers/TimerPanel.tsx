import { memo, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { repo } from '@/data';
import { qk, useTimers } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { useTick } from '@/hooks/useTick';
import { useShortcuts } from '@/hooks/useShortcuts';
import { adjustPatch, displayMs, formatDuration, isExpired, pausePatch, resetPatch, startPatch } from '@/domain/timer';
import type { Timer } from '@/data/types';
import { cn } from '@/lib/cn';

/**
 * 타이머 패널.
 * 남은 시간은 종료 예정 시각으로부터 계산하며, 표시 컴포넌트만 매초 렌더링된다.
 */
export function TimerPanel({ sessionId, canManage }: { sessionId: string; canManage: boolean }) {
  const client = useQueryClient();
  const { data: timers = [] } = useTimers(sessionId);
  const [creating, setCreating] = useState(false);

  const refresh = () => void client.invalidateQueries({ queryKey: qk.timers(sessionId) });

  const update = async (timer: Timer, patch: Partial<Timer>) => {
    try {
      await repo().timers.update(timer.id, patch);
      refresh();
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  // T: 타이머 패널로 이동(타이머가 없으면 바로 만들기), Space: 첫 번째 타이머 시작/일시 정지
  useShortcuts([
    {
      combo: 't',
      handler: () => {
        if (canManage && timers.length === 0) {
          setCreating(true);
          return;
        }
        document.getElementById('timer-panel')?.scrollIntoView({ block: 'nearest' });
        document.getElementById('timer-primary-action')?.focus();
      },
    },
    {
      combo: 'space',
      handler: () => {
        if (!canManage) return;
        const target = timers.find((t) => t.state === 'running') ?? timers[0];
        if (!target) return;
        void update(target, target.state === 'running' ? pausePatch(target) : startPatch(target));
      },
    },
  ]);

  return (
    <section aria-label="타이머" id="timer-panel" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">타이머</h2>
        {canManage ? (
          <Button
            size="sm"
            variant="ghost"
            id={timers.length === 0 ? 'timer-primary-action' : undefined}
            onClick={() => setCreating(true)}
            aria-label="타이머 추가"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {timers.length === 0 ? (
        <p className="px-1 py-3 text-sm text-[var(--color-fg-muted)]">
          {canManage ? '제한 시간이 필요한 장면에서 타이머를 만들어 공유하세요.' : '공유된 타이머가 없습니다.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {timers.map((timer, index) => (
            <TimerRow key={timer.id} timer={timer} isPrimary={index === 0} canManage={canManage} onUpdate={update} onDelete={async () => {
              await repo().timers.remove(timer.id);
              refresh();
            }} />
          ))}
        </ul>
      )}

      {creating ? <CreateTimerDialog sessionId={sessionId} onClose={() => setCreating(false)} onCreated={refresh} /> : null}
    </section>
  );
}

const TimerRow = memo(function TimerRow({
  timer,
  isPrimary,
  canManage,
  onUpdate,
  onDelete,
}: {
  timer: Timer;
  isPrimary: boolean;
  canManage: boolean;
  onUpdate: (timer: Timer, patch: Partial<Timer>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const now = useTick(500, timer.state === 'running');
  const ms = displayMs(timer, now);
  const finishedRef = useRef(false);

  // 종료 시점에 한 번만 상태를 바꾸고 알림을 띄운다.
  useEffect(() => {
    if (!canManage) return;
    if (isExpired(timer, now) && !finishedRef.current) {
      finishedRef.current = true;
      void onUpdate(timer, { state: 'finished' });
    }
    if (timer.state !== 'running') finishedRef.current = false;
  }, [timer, now, canManage, onUpdate]);

  const running = timer.state === 'running';
  const urgent = timer.kind === 'countdown' && ms <= 10_000 && ms > 0 && running;

  return (
    <li className={cn('rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3', urgent && 'border-[var(--color-danger)]')}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{timer.name}</p>
          {timer.description ? <p className="truncate text-xs text-[var(--color-fg-muted)]">{timer.description}</p> : null}
        </div>
        <output
          aria-live={urgent ? 'assertive' : 'off'}
          className={cn('shrink-0 font-mono text-xl font-bold tabular-nums', urgent && 'text-[var(--color-danger)]')}
        >
          {formatDuration(ms)}
        </output>
      </div>

      {timer.state === 'finished' ? (
        <p role="status" className="mt-1 text-xs font-medium text-[var(--color-danger)]">
          {timer.end_message || '시간이 종료되었습니다.'}
        </p>
      ) : null}

      {!timer.is_shared ? <p className="mt-1 text-xs text-[var(--color-fg-muted)]">비공개 타이머 (플레이어에게 보이지 않음)</p> : null}

      {canManage ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button
            size="sm"
            id={isPrimary ? 'timer-primary-action' : undefined}
            variant={running ? 'secondary' : 'primary'}
            onClick={() => void onUpdate(timer, running ? pausePatch(timer) : startPatch(timer))}
            aria-label={running ? `${timer.name} 일시 정지` : `${timer.name} 시작`}
          >
            {running ? <Pause aria-hidden className="h-4 w-4" /> : <Play aria-hidden className="h-4 w-4" />}
            {running ? '일시 정지' : '시작'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onUpdate(timer, resetPatch())} aria-label={`${timer.name} 초기화`}>
            <RotateCcw aria-hidden className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onUpdate(timer, adjustPatch(timer, 30))}>
            +30초
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onUpdate(timer, adjustPatch(timer, -30))}>
            −30초
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void onDelete()} aria-label={`${timer.name} 삭제`}>
            <Trash2 aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
});

function CreateTimerDialog({ sessionId, onClose, onCreated }: { sessionId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(1);
  const [seconds, setSeconds] = useState(0);
  const [kind, setKind] = useState<Timer['kind']>('countdown');
  const [shared, setShared] = useState(true);
  const [endMessage, setEndMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await repo().timers.create(sessionId, {
        name: name.trim() || '새 타이머',
        kind,
        duration_seconds: minutes * 60 + seconds,
        is_shared: shared,
        end_message: endMessage,
      });
      onCreated();
      onClose();
      toast.success('타이머를 만들었습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="새 타이머"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            만들기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="이름">
          {({ id }) => <Input id={id} value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="예: 결정까지 남은 시간" />}
        </Field>
        <Field label="종류">
          {({ id }) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as Timer['kind'])}>
              <option value="countdown">카운트다운</option>
              <option value="stopwatch">스톱워치</option>
            </Select>
          )}
        </Field>
        {kind === 'countdown' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="분">{({ id }) => <Input id={id} type="number" min={0} max={180} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />}</Field>
            <Field label="초">{({ id }) => <Input id={id} type="number" min={0} max={59} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />}</Field>
          </div>
        ) : null}
        <Field label="종료 메시지">
          {({ id }) => <Input id={id} value={endMessage} onChange={(e) => setEndMessage(e.target.value)} placeholder="예: 시간이 다 됐습니다!" />}
        </Field>
        <Checkbox label="플레이어에게 공유" checked={shared} onChange={(e) => setShared(e.target.checked)} />
      </div>
    </Dialog>
  );
}
