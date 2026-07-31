import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { repo } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { toEntries } from '@/domain/conditionLibrary';
import { DURATION_MODES, DURATION_MODE_LABELS, type Combatant, type DurationMode } from '@/data/types';
import type { ConditionInput } from '@/data/repository';

export function ConditionDialog({
  campaignId,
  combatant,
  combatants,
  onClose,
  onSubmit,
}: {
  campaignId: string;
  combatant: Combatant;
  combatants: Combatant[];
  onClose: () => void;
  onSubmit: (input: ConditionInput) => Promise<void>;
}) {
  // 시스템 기본 + 캠페인 전용 상태를 모두 고를 수 있어야 한다.
  const { data: library = [] } = useQuery({
    queryKey: ['condition-library', campaignId],
    queryFn: () => repo().combat.conditionLibrary(campaignId),
    staleTime: 60_000,
  });
  const entries = useMemo(() => toEntries(library), [library]);

  const [conditionKey, setConditionKey] = useState('');
  const [customName, setCustomName] = useState('');
  const [durationMode, setDurationMode] = useState<DurationMode>('manual');
  const [rounds, setRounds] = useState(1);
  const [sourceId, setSourceId] = useState('');
  const [linkedConcentration, setLinkedConcentration] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);

  const effectiveKey = conditionKey || entries[0]?.key || '';
  const selected = entries.find((entry) => entry.key === effectiveKey) ?? null;

  const submit = async () => {
    setBusy(true);
    try {
      const isCustom = effectiveKey === '__custom__';
      await onSubmit({
        condition_key: isCustom ? (customName.trim() || '사용자 정의 상태') : effectiveKey,
        custom_name: isCustom ? customName.trim() || '사용자 정의 상태' : (selected?.name ?? null),
        icon: selected?.icon,
        description: selected ? [selected.summary, ...selected.details].filter(Boolean).join('\n') : undefined,
        stacks: 1,
        duration_mode: durationMode,
        duration_rounds: durationMode === 'rounds' ? rounds : null,
        source_combatant_id: sourceId || null,
        linked_concentration: linkedConcentration,
        is_public: isPublic,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${combatant.name}에게 상태 효과 적용`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            적용
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="상태 효과">
          {({ id }) => (
            <Select id={id} value={effectiveKey} onChange={(e) => setConditionKey(e.target.value)} autoFocus>
              {entries.map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.isCustom ? `★ ${entry.name}` : entry.name}
                </option>
              ))}
              <option value="__custom__">사용자 정의…</option>
            </Select>
          )}
        </Field>

        {effectiveKey === '__custom__' ? (
          <Field label="상태 이름" required>
            {({ id }) => <Input id={id} value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="예: 표식" />}
          </Field>
        ) : (
          <p className="rounded-lg bg-[var(--color-surface-2)] p-2.5 text-xs text-[var(--color-fg-muted)]">
            {selected?.summary || '설명이 없습니다.'}
            {selected?.isStackable ? ' (누적되는 상태)' : ''}
          </p>
        )}

        <Field label="지속 시간">
          {({ id }) => (
            <Select id={id} value={durationMode} onChange={(e) => setDurationMode(e.target.value as DurationMode)}>
              {DURATION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {DURATION_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {durationMode === 'rounds' ? (
          <Field label="라운드 수">
            {({ id }) => <Input id={id} type="number" min={1} max={100} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} />}
          </Field>
        ) : null}

        {durationMode.startsWith('source') ? (
          <Field label="시전자">
            {({ id }) => (
              <Select id={id} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">선택 안 함</option>
                {combatants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}

        <Checkbox
          label="집중과 연동"
          hint="시전자의 집중이 끊기면 이 상태도 함께 종료됩니다."
          checked={linkedConcentration}
          onChange={(e) => setLinkedConcentration(e.target.checked)}
        />
        <Checkbox
          label="플레이어에게 공개"
          hint="끄면 던전 마스터만 이 상태를 볼 수 있습니다."
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
      </div>
    </Dialog>
  );
}
