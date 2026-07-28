import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { repo } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { generatedMonsterToCard, monsterPromptSchema, type GeneratedMonster, type MonsterPromptInput } from '@/domain/monsterSchema';
import { ABILITY_LABELS } from '@/data/types';
import { abilityModifier, formatModifier } from '@/domain/abilities';

/**
 * AI 몬스터 생성.
 * 결과는 즉시 저장하지 않고 검토 후 카드로 저장한다.
 * AI 키는 서버(Edge Function)에만 존재하며 클라이언트에 노출되지 않는다.
 */
export function MonsterGeneratorDialog({
  campaignId,
  folderId,
  onClose,
  onSaved,
}: {
  campaignId: string;
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [input, setInput] = useState<MonsterPromptInput>({ prompt: '', target_cr: '5', party_size: 4, party_level: 5 });
  const [result, setResult] = useState<GeneratedMonster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    const parsed = monsterPromptSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const monster = await repo().ai.generateMonster(campaignId, parsed.data);
      setResult(monster);
    } catch (err) {
      setError(toUserMessage(err, 'AI 몬스터 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const converted = generatedMonsterToCard(result);
      await repo().library.createCard(campaignId, {
        type: 'monster',
        name: converted.name,
        summary: converted.summary,
        dm_notes: converted.dm_notes,
        folder_id: folderId,
        stats: converted.stats,
        sections: converted.sections,
      });
      toast.success('몬스터 카드를 저장했습니다. 비공개 상태이니 필요할 때 공개하세요.');
      onSaved();
    } catch (err) {
      toast.error(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="AI 몬스터 생성"
      description="자연어로 설명하면 D&D 5e 형식의 초안을 만들어 줍니다. 저장 전에 검토하고 수정하세요."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          {result ? (
            <>
              <Button variant="secondary" loading={busy} onClick={generate}>
                다시 생성
              </Button>
              <Button variant="primary" loading={busy} onClick={save}>
                카드로 저장
              </Button>
            </>
          ) : (
            <Button variant="primary" loading={busy} onClick={generate}>
              <Wand2 aria-hidden className="h-4 w-4" />
              생성하기
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <MonsterPreview monster={result} onEdit={(patch) => setResult({ ...result, ...patch })} />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="설명" required error={error ?? undefined} hint="예: 얼음 호수 아래에서 사냥하는 CR 7의 언데드 기사. 방어력이 높고 냉기 반격을 한다.">
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                rows={4}
                autoFocus
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={input.prompt}
                maxLength={1500}
                onChange={(e) => setInput({ ...input, prompt: e.target.value })}
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="목표 도전 등급">
              {({ id }) => <Input id={id} value={input.target_cr ?? ''} onChange={(e) => setInput({ ...input, target_cr: e.target.value })} />}
            </Field>
            <Field label="파티 인원">
              {({ id }) => (
                <Input id={id} type="number" min={1} max={10} value={input.party_size ?? 4} onChange={(e) => setInput({ ...input, party_size: Number(e.target.value) })} />
              )}
            </Field>
            <Field label="파티 레벨">
              {({ id }) => (
                <Input id={id} type="number" min={1} max={20} value={input.party_level ?? 5} onChange={(e) => setInput({ ...input, party_level: Number(e.target.value) })} />
              )}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="역할">
              {({ id }) => (
                <Select id={id} value={input.role ?? ''} onChange={(e) => setInput({ ...input, role: e.target.value })}>
                  <option value="">지정 안 함</option>
                  <option value="brute">돌격형</option>
                  <option value="skirmisher">기동형</option>
                  <option value="controller">제어형</option>
                  <option value="artillery">원거리형</option>
                  <option value="leader">지휘형</option>
                  <option value="boss">보스</option>
                </Select>
              )}
            </Field>
            <Field label="크기">
              {({ id }) => (
                <Select id={id} value={input.size ?? ''} onChange={(e) => setInput({ ...input, size: e.target.value })}>
                  <option value="">지정 안 함</option>
                  {['초소형', '소형', '중형', '대형', '거대형', '초대형'].map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="특수 기믹">
            {({ id }) => (
              <Input id={id} value={input.gimmick ?? ''} onChange={(e) => setInput({ ...input, gimmick: e.target.value })} placeholder="예: HP가 절반 이하가 되면 주변을 얼린다" />
            )}
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function MonsterPreview({ monster, onEdit }: { monster: GeneratedMonster; onEdit: (patch: Partial<GeneratedMonster>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-3 text-sm">
        검토 후 수정할 수 있습니다. 저장하면 <strong>비공개</strong> 몬스터 카드로 추가됩니다.
      </div>

      <Field label="이름">
        {({ id }) => <Input id={id} value={monster.name} onChange={(e) => onEdit({ name: e.target.value })} />}
      </Field>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="도전 등급">{({ id }) => <Input id={id} value={monster.cr} onChange={(e) => onEdit({ cr: e.target.value })} />}</Field>
        <Field label="방어도">{({ id }) => <Input id={id} type="number" value={monster.ac} onChange={(e) => onEdit({ ac: Number(e.target.value) })} />}</Field>
        <Field label="HP">{({ id }) => <Input id={id} type="number" value={monster.hp} onChange={(e) => onEdit({ hp: Number(e.target.value) })} />}</Field>
        <Field label="크기">{({ id }) => <Input id={id} value={monster.size} onChange={(e) => onEdit({ size: e.target.value })} />}</Field>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">능력치</p>
        <div className="grid grid-cols-6 gap-2">
          {(Object.keys(ABILITY_LABELS) as (keyof typeof ABILITY_LABELS)[]).map((key) => (
            <div key={key} className="rounded-lg border border-[var(--color-border)] p-2 text-center">
              <span className="block text-xs text-[var(--color-fg-muted)]">{ABILITY_LABELS[key]}</span>
              <span className="block text-lg font-semibold">{monster.abilities[key]}</span>
              <span className="text-xs text-[var(--color-fg-muted)]">{formatModifier(abilityModifier(monster.abilities[key]))}</span>
            </div>
          ))}
        </div>
      </div>

      {monster.description ? <p className="text-sm text-[var(--color-fg-muted)]">{monster.description}</p> : null}

      {[
        ['특성', monster.traits],
        ['행동', monster.actions],
        ['반응', monster.reactions],
        ['전설적 행동', monster.legendary_actions],
      ].map(([label, items]) => {
        const list = items as { name: string; description: string }[];
        if (!list || list.length === 0) return null;
        return (
          <section key={String(label)}>
            <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              <Badge tone="accent">{String(label)}</Badge>
            </h3>
            <ul className="flex flex-col gap-2">
              {list.map((item, index) => (
                <li key={index} className="rounded-lg bg-[var(--color-surface-2)] p-2.5 text-sm">
                  <strong>{item.name}.</strong> {item.description}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {monster.tactics ? (
        <section>
          <h3 className="mb-1.5 text-sm font-semibold">전투 운영 지침</h3>
          <p className="rounded-lg bg-[var(--color-surface-2)] p-2.5 text-sm">{monster.tactics}</p>
        </section>
      ) : null}
    </div>
  );
}
