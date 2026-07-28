import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dices } from 'lucide-react';
import { repo } from '@/data';
import { qk, useDiceRolls } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { criticalKind, formatRollDetail, parseExpression } from '@/domain/dice';
import { DICE_VISIBILITIES, DICE_VISIBILITY_LABELS, type DiceVisibility } from '@/data/types';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/cn';

const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100];

export function DicePanel({ campaignId, sessionId, isDM }: { campaignId: string; sessionId: string; isDM: boolean }) {
  const client = useQueryClient();
  const { data: rolls = [] } = useDiceRolls(sessionId);
  const [expression, setExpression] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visibility, setVisibility] = useState<DiceVisibility>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const roll = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      parseExpression(trimmed);
    } catch (err) {
      setError(toUserMessage(err, '주사위 식을 해석할 수 없습니다. 예: 2d6+3'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await repo().dice.roll({ campaignId, sessionId, expression: trimmed, purpose, visibility });
      void client.invalidateQueries({ queryKey: qk.dice(sessionId) });
      setExpression('');
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="주사위" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">주사위</h2>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_DICE.map((sides) => (
          <Button key={sides} size="sm" variant="secondary" onClick={() => void roll(`1d${sides}`)} disabled={busy}>
            d{sides}
          </Button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void roll(expression);
        }}
        className="flex flex-col gap-2"
      >
        <Field label="주사위 식" error={error ?? undefined} hint="예: 2d20kh1+5 (이점), 4d6-2">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              placeholder="1d20+5"
              maxLength={100}
            />
          )}
        </Field>
        <div className="flex gap-2">
          <Field label="목적" className="flex-1">
            {({ id }) => <Input id={id} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 은신 판정" />}
          </Field>
          <Field label="공개 범위" className="w-40">
            {({ id }) => (
              <Select id={id} value={visibility} onChange={(e) => setVisibility(e.target.value as DiceVisibility)}>
                {DICE_VISIBILITIES.filter((v) => isDM || v !== 'dm_secret').map((value) => (
                  <option key={value} value={value}>
                    {DICE_VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={busy}>
          <Dices aria-hidden className="h-4 w-4" />
          굴리기
        </Button>
      </form>

      <div className="scroll-area max-h-64 overflow-y-auto" aria-live="polite">
        {rolls.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--color-fg-muted)]">아직 굴림 기록이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rolls.map((entry) => {
              const crit = criticalKind(entry.detail);
              return (
                <li key={entry.id} className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">
                      {entry.user_name}
                      {entry.purpose ? <span className="text-[var(--color-fg-muted)]"> · {entry.purpose}</span> : null}
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-lg font-bold tabular-nums',
                        crit === 'crit' && 'text-[var(--color-success)]',
                        crit === 'fumble' && 'text-[var(--color-danger)]',
                      )}
                    >
                      {entry.total}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-[var(--color-fg-muted)]">
                    <span className="truncate">
                      {entry.expression} → {formatRollDetail(entry.detail)}
                    </span>
                    <time className="shrink-0">{formatTime(entry.created_at)}</time>
                  </div>
                  {entry.visibility !== 'all' ? (
                    <span className="text-[11px] text-[var(--color-fg-muted)]">{DICE_VISIBILITY_LABELS[entry.visibility]}</span>
                  ) : null}
                  {crit ? (
                    <span className={cn('text-[11px] font-semibold', crit === 'crit' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                      {crit === 'crit' ? '자연 20!' : '자연 1'}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
