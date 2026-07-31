import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  EyeOff,
  Heart,
  Plus,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { repo } from '@/data';
import { qk, useCombatants, useEncounter } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge, EmptyState, ErrorState } from '@/components/ui/feedback';
import { HpBar } from '@/components/ui/HpBar';
import { toast } from '@/components/ui/Toast';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { runOrToast, toUserMessage } from '@/lib/errors';
import { useShortcuts } from '@/hooks/useShortcuts';
import { rollExpression } from '@/domain/dice';
import { abilityModifier } from '@/domain/abilities';
import { applyDamage, hpTier } from '@/domain/hp';
import { evaluateConcentration } from '@/domain/concentration';
import { turnOrder } from '@/domain/initiative';
import { describeDuration, expiredOnTurnChange } from '@/domain/conditions';
import { ConditionBadge } from '@/features/conditions/ConditionBadge';
import type { Combatant, Encounter } from '@/data/types';
import { AddCombatantDialog } from './AddCombatantDialog';
import { ConditionDialog } from './ConditionDialog';
import { cn } from '@/lib/cn';

/** 던전 마스터용 전투 패널 */
export function EncounterPanel({ sessionId, campaignId }: { sessionId: string; campaignId: string }) {
  const client = useQueryClient();
  const { data: encounter, error: encounterError, isLoading: encounterLoading, refetch: refetchEncounter } = useEncounter(sessionId);
  const { data: combatants = [], error: combatantsError } = useCombatants(encounter?.id);
  const [adding, setAdding] = useState(false);
  const [conditionTarget, setConditionTarget] = useState<Combatant | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  // 턴 진행이 겹쳐서 실행되면 라운드 계산이 어긋나므로 한 번에 하나만 처리한다.
  const [turnBusy, setTurnBusy] = useState(false);
  // 전투 만들기를 연달아 누르면 빈 전투가 여러 개 생긴다.
  const [creating, setCreating] = useState(false);

  const order = useMemo(() => turnOrder(combatants, encounter?.tiebreak_rule ?? 'dex_mod'), [combatants, encounter?.tiebreak_rule]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.encounter(sessionId) });
    if (encounter) void client.invalidateQueries({ queryKey: qk.combatants(encounter.id) });
  };

  /** 실패하면 반드시 메시지를 띄우고, 성공하면 목록을 새로 고친다. */
  const run = (action: () => Promise<unknown>) =>
    void runOrToast(action, toast.error).then((ok) => {
      if (ok) refresh();
    });

  useShortcuts([
    { combo: 'i', handler: () => document.getElementById('next-turn-button')?.focus() },
  ]);

  const createEncounter = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await runOrToast(() => repo().combat.createEncounter(sessionId, '새 전투'), toast.error, '전투를 만들지 못했습니다.');
      refresh();
    } finally {
      setCreating(false);
    }
  };

  // 불러오기가 실패했는데 "전투가 없습니다"만 보이면 원인을 알 수 없다.
  if (encounterError) {
    return <ErrorState message={toUserMessage(encounterError, '전투를 불러오지 못했습니다.')} onRetry={() => void refetchEncounter()} />;
  }

  if (!encounter) {
    return (
      <EmptyState
        icon={<Swords aria-hidden className="h-8 w-8" />}
        title={encounterLoading ? '전투를 불러오는 중입니다' : '진행 중인 전투가 없습니다'}
        description="전투를 만들고 플레이어와 몬스터를 추가하세요."
        action={encounterLoading || creating ? undefined : { label: '전투 만들기', onClick: createEncounter }}
      />
    );
  }

  const nextTurn = async () => {
    if (turnBusy) return;
    setTurnBusy(true);
    try {
      await advanceTurn();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setTurnBusy(false);
    }
  };

  const advanceTurn = async () => {
    const before = { active: encounter.active_combatant_id, round: encounter.round };
    const updated = await repo().combat.nextTurn(encounter.id);
    refresh();

    // 만료된 상태 효과를 정리하고 DM에게 알린다.
    const allConditions = combatants.flatMap((c) => c.conditions ?? []);
    const expired = expiredOnTurnChange(allConditions, {
      endingCombatantId: before.active,
      endingRound: before.round,
      startingCombatantId: updated.active_combatant_id,
      startingRound: updated.round,
    });
    for (const condition of expired) {
      await repo().combat.removeCondition(condition.id);
    }
    if (expired.length > 0) {
      refresh();
      toast.info(`만료된 상태 효과 ${expired.length}건을 해제했습니다.`);
    }
  };

  const rollAllInitiative = () =>
    run(async () => {
      const rolled = await rollMissingInitiative();
      toast.success(rolled > 0 ? `이니셔티브를 굴렸습니다. (${rolled}명)` : '이니셔티브를 굴렸습니다.');
    });

  /** 아직 이니셔티브가 없는 참가자만 굴린다. 굴린 인원 수를 돌려준다. */
  const rollMissingInitiative = async () => {
    let rolled = 0;
    for (const combatant of combatants) {
      if (combatant.initiative !== null) continue;
      const result = rollExpression('1d20');
      await repo().combat.updateCombatant(combatant.id, { initiative: result.total + combatant.dex_mod });
      rolled += 1;
    }
    return rolled;
  };

  const startCombat = () =>
    run(async () => {
      // 이니셔티브를 아무도 굴리지 않았으면 먼저 굴려 준다.
      // 예전에는 버튼이 비활성이라 왜 시작이 안 되는지 알 수 없었다.
      if (order.length === 0) {
        const rolled = await rollMissingInitiative();
        if (rolled > 0) toast.info(`이니셔티브를 자동으로 굴렸습니다. (${rolled}명)`);
      }
      await repo().combat.updateEncounter(encounter.id, { status: 'active' });
    });

  const endCombat = () =>
    confirmAndRun(
      { title: '전투를 종료할까요?', description: '이니셔티브와 현재 턴 표시가 사라집니다. 기록은 세션 로그에 남습니다.', confirmLabel: '전투 종료' },
      async () => {
        await repo().combat.endEncounter(encounter.id);
        refresh();
      },
      '전투를 종료했습니다.',
    );

  const applyToSelected = async (kind: 'damage' | 'heal', amount: number, half = false) => {
    if (selected.length === 0) return;
    const value = half ? Math.floor(amount / 2) : amount;
    try {
      await repo().combat.applyHp(
        encounter.id,
        selected.map((id) => ({ combatantId: id, amount: value, kind })),
      );
      refresh();
      setSelected([]);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <section aria-label="전투" className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">
          <Swords aria-hidden className="h-4 w-4" />
          {encounter.name}
        </h2>
        <Badge tone={encounter.status === 'active' ? 'success' : 'default'}>
          {encounter.status === 'active' ? `라운드 ${encounter.round}` : '준비 중'}
        </Badge>
        <div className="ml-auto flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="h-4 w-4" />
            참가자
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={rollAllInitiative}
            disabled={combatants.length === 0}
            title="이니셔티브가 비어 있는 참가자만 굴립니다."
          >
            <Dices aria-hidden className="h-4 w-4" />
            전체 굴림
          </Button>
          {encounter.status === 'active' ? (
            <Button size="sm" variant="ghost" onClick={endCombat}>
              전투 종료
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={startCombat}
              disabled={combatants.length === 0}
              title={combatants.length === 0 ? '참가자를 먼저 추가하세요.' : '이니셔티브가 없으면 자동으로 굴립니다.'}
            >
              전투 시작
            </Button>
          )}
        </div>
      </header>

      {encounter.status === 'active' ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <Button size="sm" variant="secondary" onClick={() => run(() => repo().combat.previousTurn(encounter.id))} aria-label="이전 턴">
            <ChevronLeft aria-hidden className="h-4 w-4" />
            이전
          </Button>
          <Button id="next-turn-button" variant="primary" loading={turnBusy} onClick={() => void nextTurn()} data-testid="next-turn">
            다음 턴
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              aria-label="라운드 감소"
              onClick={() => run(() => repo().combat.setRound(encounter.id, encounter.round - 1))}
            >
              −
            </Button>
            <span className="text-sm font-medium" data-testid="round-display">
              라운드 {encounter.round}
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label="라운드 증가"
              onClick={() => run(() => repo().combat.setRound(encounter.id, encounter.round + 1))}
            >
              +
            </Button>
          </div>
        </div>
      ) : null}

      {combatantsError ? (
        <p role="alert" className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {toUserMessage(combatantsError, '참가자 목록을 불러오지 못했습니다.')}
        </p>
      ) : null}

      {selected.length > 0 ? <AreaDamageBar count={selected.length} onApply={applyToSelected} onClear={() => setSelected([])} /> : null}

      {combatants.length === 0 ? (
        <EmptyState title="참가자가 없습니다" description="플레이어 캐릭터와 몬스터를 추가해 전투를 준비하세요." action={{ label: '참가자 추가', onClick: () => setAdding(true) }} />
      ) : (
        <ul className="flex flex-col gap-2">
          {order.concat(combatants.filter((c) => c.initiative === null)).map((combatant) => (
            <CombatantRow
              key={combatant.id}
              combatant={combatant}
              encounter={encounter}
              selected={selected.includes(combatant.id)}
              onToggleSelect={() =>
                setSelected((prev) => (prev.includes(combatant.id) ? prev.filter((id) => id !== combatant.id) : [...prev, combatant.id]))
              }
              onChanged={refresh}
              onAddCondition={() => setConditionTarget(combatant)}
            />
          ))}
        </ul>
      )}

      {adding ? (
        <AddCombatantDialog
          campaignId={campaignId}
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            await repo().combat.addCombatant(encounter.id, input);
            refresh();
            toast.success('참가자를 추가했습니다.');
          }}
        />
      ) : null}

      {conditionTarget ? (
        <ConditionDialog
          campaignId={campaignId}
          combatant={conditionTarget}
          combatants={combatants}
          onClose={() => setConditionTarget(null)}
          onSubmit={async (input) => {
            await repo().combat.addCondition(conditionTarget.id, input);
            refresh();
            toast.success('상태 효과를 적용했습니다.');
          }}
        />
      ) : null}
    </section>
  );
}

function AreaDamageBar({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (kind: 'damage' | 'heal', amount: number, half?: boolean) => Promise<void>;
  onClear: () => void;
}) {
  const [amount, setAmount] = useState('');
  const value = Number(amount) || 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/8 px-3 py-2">
      <span className="text-sm font-medium">{count}명 선택 · 광역 적용</span>
      <label className="sr-only" htmlFor="area-damage-amount">
        광역 피해량
      </label>
      <Input
        id="area-damage-amount"
        type="number"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-24"
        placeholder="피해량"
      />
      <Button size="sm" variant="danger" disabled={value <= 0} onClick={() => void onApply('damage', value)}>
        전체 피해 {value > 0 ? value : ''}
      </Button>
      <Button size="sm" variant="secondary" disabled={value <= 0} onClick={() => void onApply('damage', value, true)}>
        절반 피해 {value > 0 ? Math.floor(value / 2) : ''}
      </Button>
      <Button size="sm" variant="secondary" disabled={value <= 0} onClick={() => void onApply('heal', value)}>
        회복
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        선택 해제
      </Button>
    </div>
  );
}

function CombatantRow({
  combatant,
  encounter,
  selected,
  onToggleSelect,
  onChanged,
  onAddCondition,
}: {
  combatant: Combatant;
  encounter: Encounter;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: () => void;
  onAddCondition: () => void;
}) {
  const [amount, setAmount] = useState('');
  const isActive = encounter.active_combatant_id === combatant.id;
  const value = Number(amount) || 0;

  const preview = value > 0 ? applyDamage({ hp: combatant.hp, maxHp: combatant.max_hp, tempHp: combatant.temp_hp }, value) : null;

  /** 실패하면 반드시 메시지를 띄운다. 성공했을 때만 뒷정리를 한다. */
  const run = (action: () => Promise<unknown>, after?: () => void) =>
    void runOrToast(action, toast.error).then((ok) => {
      if (!ok) return;
      after?.();
      onChanged();
    });

  const apply = (kind: 'damage' | 'heal' | 'temp') => {
    if (value <= 0) return;
    run(
      () => repo().combat.applyHp(encounter.id, [{ combatantId: combatant.id, amount: value, kind }]),
      () => {
        if (kind === 'damage' && combatant.is_concentrating) {
          const check = evaluateConcentration({
            isConcentrating: true,
            damage: value,
            droppedToZero: preview?.droppedToZero ?? false,
          });
          if (check.required) {
            toast.warning(`${combatant.name}의 집중 유지 판정이 필요합니다. ${check.reason}`);
          } else if (check.reason) {
            toast.info(`${combatant.name}: ${check.reason}`);
          }
        }
        setAmount('');
      },
    );
  };

  const setInitiative = (next: string) => {
    const parsed = next === '' ? null : Number(next);
    run(() =>
      repo().combat.updateCombatant(combatant.id, { initiative: parsed === null || Number.isNaN(parsed) ? null : parsed }),
    );
  };

  const rollInitiative = () => {
    const result = rollExpression('1d20');
    run(() => repo().combat.updateCombatant(combatant.id, { initiative: result.total + combatant.dex_mod }));
  };

  return (
    <li
      data-testid={`combatant-${combatant.name}`}
      className={cn(
        'rounded-xl border bg-[var(--color-surface)] p-3',
        isActive ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/40' : 'border-[var(--color-border)]',
        combatant.is_defeated && 'opacity-60',
        selected && 'ring-2 ring-[var(--color-accent)]',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`${combatant.name} 선택`}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />

        <label className="sr-only" htmlFor={`init-${combatant.id}`}>
          {combatant.name} 이니셔티브
        </label>
        <input
          id={`init-${combatant.id}`}
          type="number"
          value={combatant.initiative ?? ''}
          onChange={(e) => setInitiative(e.target.value)}
          className="w-14 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-center font-mono text-sm"
          placeholder="—"
        />
        <Button size="sm" variant="ghost" aria-label={`${combatant.name} 이니셔티브 굴리기`} onClick={rollInitiative}>
          <Dices aria-hidden className="h-4 w-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-medium">
            {isActive ? <Badge tone="accent">현재 차례</Badge> : null}
            <span className="truncate">{combatant.name}</span>
            {combatant.is_hidden ? <EyeOff aria-label="플레이어에게 숨김" className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" /> : null}
            {combatant.is_concentrating ? <Sparkles aria-label="집중 중" className="h-3.5 w-3.5 text-[var(--color-accent)]" /> : null}
            {combatant.is_defeated ? <Badge tone="danger">전투 불능</Badge> : null}
          </p>
          <p className="flex items-center gap-2 text-xs text-[var(--color-fg-muted)]">
            <Shield aria-hidden className="h-3 w-3" />
            AC {combatant.ac}
            <span aria-hidden>·</span>
            민첩 {combatant.dex_score} ({abilityModifier(combatant.dex_score) >= 0 ? '+' : ''}
            {abilityModifier(combatant.dex_score)})
          </p>
        </div>

        <div className="w-36">
          <HpBar hp={combatant.hp} maxHp={combatant.max_hp} tempHp={combatant.temp_hp} size="sm" />
        </div>
      </div>

      {(combatant.conditions ?? []).length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1">
          {(combatant.conditions ?? []).map((condition) => (
            <li
              key={condition.id}
              className="flex items-center gap-0.5 rounded-full bg-[var(--color-surface-3)] pr-1"
              title={`${condition.description} — ${describeDuration(condition, encounter.round)}`}
            >
              <ConditionBadge
                conditionKey={condition.condition_key}
                name={condition.custom_name ?? condition.condition_key}
                stacks={condition.stacks}
                className="bg-transparent hover:bg-transparent"
              />
              {!condition.is_public ? <EyeOff aria-label="비공개" className="h-3 w-3 text-[var(--color-fg-muted)]" /> : null}
              <button
                type="button"
                onClick={() => run(() => repo().combat.setConditionStacks(condition.id, (condition.stacks ?? 1) - 1))}
                aria-label={`${condition.custom_name} 스택 1 줄이기`}
                className="rounded px-1 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => run(() => repo().combat.setConditionStacks(condition.id, (condition.stacks ?? 1) + 1))}
                aria-label={`${condition.custom_name} 스택 1 늘리기`}
                className="rounded px-1 text-xs text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => run(() => repo().combat.removeCondition(condition.id))}
                aria-label={`${condition.custom_name} 해제`}
                className="rounded px-0.5 text-[var(--color-fg-muted)] hover:text-[var(--color-danger)]"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <label className="sr-only" htmlFor={`hp-${combatant.id}`}>
          {combatant.name} HP 조정값
        </label>
        <input
          id={`hp-${combatant.id}`}
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="값"
          className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply('damage');
          }}
        />
        <Button size="sm" variant="danger" onClick={() => apply('damage')} disabled={value <= 0}>
          피해
        </Button>
        <Button size="sm" variant="secondary" onClick={() => apply('heal')} disabled={value <= 0}>
          <Heart aria-hidden className="h-3.5 w-3.5" />
          회복
        </Button>
        <Button size="sm" variant="secondary" onClick={() => apply('temp')} disabled={value <= 0}>
          임시
        </Button>

        {preview ? (
          <span className="text-xs text-[var(--color-fg-muted)]" aria-live="polite">
            적용 후 {preview.hp} / {combatant.max_hp}
            {preview.tempHp > 0 ? ` (임시 ${preview.tempHp})` : ''} · {hpTier(preview.hp, combatant.max_hp) === 'down' ? '전투 불능' : ''}
          </span>
        ) : null}

        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-label={`${combatant.name} 상태 추가`} onClick={onAddCondition}>
            상태 추가
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={combatant.is_concentrating}
            onClick={() => run(() => repo().combat.setConcentration(combatant.id, !combatant.is_concentrating))}
          >
            집중 {combatant.is_concentrating ? '해제' : '설정'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`${combatant.name} 전투에서 제거`}
            onClick={() =>
              confirmAndRun(
                { title: `${combatant.name}을(를) 제거할까요?`, confirmLabel: '제거', danger: true },
                async () => {
                  await repo().combat.removeCombatant(combatant.id);
                  onChanged();
                },
              )
            }
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </li>
  );
}
