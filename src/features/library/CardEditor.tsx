import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, CloudOff, Loader2, Plus, Save, Trash2, TriangleAlert } from 'lucide-react';
import { repo } from '@/data';
import { qk, useTags } from '@/hooks/queries';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { isConflict } from '@/lib/errors';
import { SAVE_STATUS_LABELS, loadDraft, useAutosave } from '@/hooks/useAutosave';
import { useShortcuts } from '@/hooks/useShortcuts';
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  CARD_TYPES,
  CARD_TYPE_LABELS,
  SECTION_KINDS,
  SECTION_KIND_LABELS,
  type Card,
  type CardSection,
  type CardType,
  type MonsterStats,
  type RichDoc,
  type SectionKind,
} from '@/data/types';
import { abilityModifier, formatModifier, proficiencyBonusForCR } from '@/domain/abilities';
import { defaultMonsterStats } from '@/data/defaults';
import { ImageUpload } from './ImageUpload';
import { cn } from '@/lib/cn';

const InlineRichText = lazy(() => import('@/features/editor/InlineRichText').then((m) => ({ default: m.InlineRichText })));
const RichTextEditor = lazy(() => import('@/features/editor/RichTextEditor').then((m) => ({ default: m.RichTextEditor })));

interface CardEditorProps {
  card: Card;
  campaignId: string;
  onClose: () => void;
}

interface EditorState {
  name: string;
  type: CardType;
  summary: string;
  body: RichDoc | null;
  image_url: string | null;
  dm_notes: string;
  tag_ids: string[];
  stats: Omit<MonsterStats, 'card_id'> | null;
  sections: Omit<CardSection, 'id' | 'card_id'>[];
}

function toState(card: Card): EditorState {
  return {
    name: card.name,
    type: card.type,
    summary: card.summary,
    body: card.body,
    image_url: card.image_url,
    dm_notes: card.dm_notes,
    tag_ids: card.tag_ids ?? [],
    stats: card.stats ? { ...card.stats } : null,
    sections: (card.sections ?? []).map(({ kind, name, description, sort_order }) => ({ kind, name, description, sort_order })),
  };
}

export function CardEditor({ card, campaignId, onClose }: CardEditorProps) {
  const client = useQueryClient();
  const { data: tags = [] } = useTags(campaignId);
  const [tab, setTab] = useState<'basic' | 'stats' | 'actions' | 'dm'>('basic');
  const [state, setState] = useState<EditorState>(() => toState(card));
  const [conflict, setConflict] = useState<Card | null>(null);
  const [version, setVersion] = useState(card.version);

  // 저장되지 않은 임시 저장본이 있으면 복구를 제안한다.
  const draft = useMemo(() => loadDraft<EditorState>(`card:${card.id}`), [card.id]);
  const [draftOffered, setDraftOffered] = useState(Boolean(draft));

  const { status, saveNow } = useAutosave<EditorState>({
    draftKey: `card:${card.id}`,
    value: state,
    onSave: async (value) => {
      try {
        const saved = await repo().library.updateCard(
          card.id,
          {
            name: value.name,
            type: value.type,
            summary: value.summary,
            body: value.body,
            image_url: value.image_url,
            dm_notes: value.dm_notes,
            tag_ids: value.tag_ids,
            ...(value.stats ? { stats: value.stats as MonsterStats } : {}),
            sections: value.sections.map((s, i) => ({ ...s, id: '', card_id: card.id, sort_order: i })),
          },
          version,
        );
        setVersion(saved.version);
        await client.invalidateQueries({ queryKey: ['cards', campaignId] });
        void client.invalidateQueries({ queryKey: qk.card(card.id) });
      } catch (error) {
        if (isConflict(error)) {
          const server = await repo().library.card(card.id);
          setConflict(server);
        }
        throw error;
      }
    },
  });

  useShortcuts([{ combo: 'mod+s', allowInInput: true, handler: () => void saveNow() }]);

  const update = <K extends keyof EditorState>(key: K, value: EditorState[K]) => setState((prev) => ({ ...prev, [key]: value }));

  const ensureStats = () => {
    if (!state.stats) update('stats', { ...defaultMonsterStats(card.id) });
  };

  useEffect(() => {
    if ((state.type === 'monster' || state.type === 'npc') && !state.stats) ensureStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.type]);

  return (
    <Dialog
      open
      onClose={onClose}
      title="카드 편집"
      size="xl"
      disableBackdropClose
      footer={
        <>
          <SaveIndicator status={status} />
          <Button variant="ghost" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={() => void saveNow()}>
            <Save aria-hidden className="h-4 w-4" />
            저장
          </Button>
        </>
      }
    >
      {draftOffered && draft ? (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-warning)]/50 bg-[var(--color-warning)]/10 px-3 py-2 text-sm">
          <TriangleAlert aria-hidden className="h-4 w-4 text-[var(--color-warning)]" />
          저장되지 않은 변경 사항이 있습니다.
          <Button size="sm" variant="secondary" onClick={() => { setState(draft.value); setDraftOffered(false); }}>
            복구하기
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraftOffered(false)}>
            무시
          </Button>
        </div>
      ) : null}

      {conflict ? (
        <ConflictBanner
          server={conflict}
          onUseServer={() => {
            setState(toState(conflict));
            setVersion(conflict.version);
            setConflict(null);
            toast.info('서버 버전을 불러왔습니다.');
          }}
          onKeepMine={() => {
            setVersion(conflict.version);
            setConflict(null);
            toast.info('내 변경 사항을 유지합니다. 다시 저장하면 덮어씁니다.');
          }}
        />
      ) : null}

      <div role="tablist" aria-label="카드 편집 탭" className="mb-4 flex gap-1 border-b border-[var(--color-border)]">
        {(
          [
            ['basic', '기본 정보'],
            ['stats', '능력치'],
            ['actions', '행동'],
            ['dm', 'DM 전용'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === key ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-transparent text-[var(--color-fg-muted)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'basic' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="카드 이름" required>
              {({ id }) => <Input id={id} value={state.name} onChange={(e) => update('name', e.target.value)} />}
            </Field>
            <Field label="카드 유형">
              {({ id }) => (
                <Select id={id} value={state.type} onChange={(e) => update('type', e.target.value as CardType)}>
                  {CARD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {CARD_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label="요약" hint="목록과 검색 결과에 표시됩니다.">
            {({ id }) => <Input id={id} value={state.summary} onChange={(e) => update('summary', e.target.value)} />}
          </Field>

          <ImageUpload campaignId={campaignId} value={state.image_url} onChange={(url) => update('image_url', url)} />

          <div>
            <span className="mb-1.5 block text-sm font-medium">본문</span>
            <Suspense fallback={<div className="h-40 animate-soft-pulse rounded-lg bg-[var(--color-surface-3)]" />}>
              <RichTextEditor label="카드 본문" value={state.body} onChange={(doc) => update('body', doc)} placeholder="설명, 배경, 대사 등을 자유롭게 작성하세요." />
            </Suspense>
          </div>

          {tags.length > 0 ? (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">태그</legend>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = state.tag_ids.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        update('tag_ids', active ? state.tag_ids.filter((t) => t !== tag.id) : [...state.tag_ids, tag.id])
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        active ? 'border-transparent text-white' : 'border-[var(--color-border)] text-[var(--color-fg-muted)]',
                      )}
                      style={active ? { backgroundColor: tag.color } : undefined}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {tab === 'stats' ? (
        state.stats ? (
          <StatsEditor stats={state.stats} onChange={(stats) => update('stats', stats)} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-[var(--color-fg-muted)]">이 카드에는 능력치 정보가 없습니다.</p>
            <Button variant="secondary" onClick={ensureStats}>
              능력치 추가
            </Button>
          </div>
        )
      ) : null}

      {tab === 'actions' ? <SectionsEditor sections={state.sections} onChange={(sections) => update('sections', sections)} /> : null}

      {tab === 'dm' ? (
        <Field label="던전 마스터 전용 메모" hint="어떤 공개 범위에서도 플레이어에게 노출되지 않습니다.">
          {({ id }) => <Textarea id={id} rows={10} value={state.dm_notes} onChange={(e) => update('dm_notes', e.target.value)} />}
        </Field>
      ) : null}
    </Dialog>
  );
}

function SaveIndicator({ status }: { status: ReturnType<typeof useAutosave>['status'] }) {
  if (status === 'idle') return <span className="mr-auto" />;
  const icons = {
    dirty: <span aria-hidden className="h-2 w-2 rounded-full bg-[var(--color-warning)]" />,
    saving: <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />,
    saved: <Check aria-hidden className="h-3.5 w-3.5 text-[var(--color-success)]" />,
    error: <TriangleAlert aria-hidden className="h-3.5 w-3.5 text-[var(--color-danger)]" />,
    offline: <CloudOff aria-hidden className="h-3.5 w-3.5 text-[var(--color-warning)]" />,
    idle: null,
  } as const;
  return (
    <span role="status" aria-live="polite" className="mr-auto flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
      {icons[status]}
      {SAVE_STATUS_LABELS[status]}
    </span>
  );
}

function ConflictBanner({ server, onUseServer, onKeepMine }: { server: Card; onUseServer: () => void; onKeepMine: () => void }) {
  return (
    <div role="alert" className="mb-4 rounded-lg border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 p-3">
      <p className="text-sm font-medium">다른 사용자가 먼저 내용을 수정했습니다.</p>
      <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
        서버 버전: <strong>{server.name}</strong> · {server.summary || '요약 없음'}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onUseServer}>
          서버 버전 사용
        </Button>
        <Button size="sm" variant="secondary" onClick={onKeepMine}>
          내 변경 사항 유지
        </Button>
      </div>
    </div>
  );
}

function StatsEditor({ stats, onChange }: { stats: Omit<MonsterStats, 'card_id'>; onChange: (stats: Omit<MonsterStats, 'card_id'>) => void }) {
  const set = <K extends keyof Omit<MonsterStats, 'card_id'>>(key: K, value: Omit<MonsterStats, 'card_id'>[K]) =>
    onChange({ ...stats, [key]: value });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="크기">{({ id }) => <Input id={id} value={stats.size} onChange={(e) => set('size', e.target.value)} />}</Field>
        <Field label="유형">{({ id }) => <Input id={id} value={stats.type} onChange={(e) => set('type', e.target.value)} />}</Field>
        <Field label="성향">{({ id }) => <Input id={id} value={stats.alignment} onChange={(e) => set('alignment', e.target.value)} />}</Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="도전 등급" hint={`숙련 +${proficiencyBonusForCR(stats.cr)}`}>
          {({ id }) => (
            <Input
              id={id}
              value={stats.cr}
              onChange={(e) => onChange({ ...stats, cr: e.target.value, proficiency_bonus: proficiencyBonusForCR(e.target.value) })}
            />
          )}
        </Field>
        <Field label="방어도">
          {({ id }) => <Input id={id} type="number" value={stats.ac} onChange={(e) => set('ac', Number(e.target.value))} />}
        </Field>
        <Field label="현재 HP" hint="최대 HP를 넘을 수 없습니다.">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={stats.max_hp}
              value={stats.hp}
              // 최대치를 넘는 값은 전투에 추가할 때 데이터베이스 제약에 걸리므로 여기서 막는다.
              onChange={(e) => set('hp', Math.max(0, Math.min(stats.max_hp, Number(e.target.value) || 0)))}
            />
          )}
        </Field>
        <Field label="최대 HP">
          {({ id }) => (
            <Input
              id={id}
              type="number"
              min={1}
              value={stats.max_hp}
              onChange={(e) => {
                const max = Math.max(1, Number(e.target.value) || 1);
                onChange({ ...stats, max_hp: max, hp: Math.min(stats.hp, max) });
              }}
            />
          )}
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">능력치</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {ABILITY_KEYS.map((key) => (
            <div key={key} className="rounded-lg border border-[var(--color-border)] p-2 text-center">
              <label htmlFor={`ability-${key}`} className="block text-xs font-medium text-[var(--color-fg-muted)]">
                {ABILITY_LABELS[key]}
              </label>
              <input
                id={`ability-${key}`}
                type="number"
                min={1}
                max={30}
                value={stats.abilities[key]}
                onChange={(e) => set('abilities', { ...stats.abilities, [key]: Number(e.target.value) })}
                className="w-full bg-transparent text-center text-lg font-semibold focus:outline-none"
              />
              <span className="text-xs text-[var(--color-fg-muted)]" aria-label={`${ABILITY_LABELS[key]} 수정치`}>
                {formatModifier(abilityModifier(stats.abilities[key]))}
              </span>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">이동 속도 (피트)</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['walk', '보행'],
              ['fly', '비행'],
              ['swim', '수영'],
              ['climb', '등반'],
              ['burrow', '굴착'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={stats.speeds[key]}
                  onChange={(e) => set('speeds', { ...stats.speeds, [key]: Number(e.target.value) })}
                />
              )}
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="피해 저항" hint="쉼표로 구분">
          {({ id }) => <Input id={id} value={stats.resistances.join(', ')} onChange={(e) => set('resistances', splitList(e.target.value))} />}
        </Field>
        <Field label="피해 면역" hint="쉼표로 구분">
          {({ id }) => <Input id={id} value={stats.immunities.join(', ')} onChange={(e) => set('immunities', splitList(e.target.value))} />}
        </Field>
        <Field label="피해 취약" hint="쉼표로 구분">
          {({ id }) => <Input id={id} value={stats.vulnerabilities.join(', ')} onChange={(e) => set('vulnerabilities', splitList(e.target.value))} />}
        </Field>
        <Field label="상태 면역" hint="쉼표로 구분">
          {({ id }) => (
            <Input id={id} value={stats.condition_immunities.join(', ')} onChange={(e) => set('condition_immunities', splitList(e.target.value))} />
          )}
        </Field>
        <Field label="감각">{({ id }) => <Input id={id} value={stats.senses} onChange={(e) => set('senses', e.target.value)} />}</Field>
        <Field label="언어">{({ id }) => <Input id={id} value={stats.languages} onChange={(e) => set('languages', e.target.value)} />}</Field>
      </div>
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * 행동 목록 편집.
 * 드래그가 어려운 사용자를 위해 위/아래 이동 버튼을 함께 제공한다.
 */
function SectionsEditor({
  sections,
  onChange,
}: {
  sections: Omit<CardSection, 'id' | 'card_id'>[];
  onChange: (sections: Omit<CardSection, 'id' | 'card_id'>[]) => void;
}) {
  const move = (index: number, delta: number) => {
    const next = [...sections];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const swap = next[target];
    if (!current || !swap) return;
    next[index] = swap;
    next[target] = current;
    onChange(next.map((s, i) => ({ ...s, sort_order: i })));
  };

  const add = (kind: SectionKind) => {
    onChange([...sections, { kind, name: '', description: '', sort_order: sections.length }]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {SECTION_KINDS.map((kind) => (
          <Button key={kind} size="sm" variant="secondary" onClick={() => add(kind)}>
            <Plus aria-hidden className="h-3.5 w-3.5" />
            {SECTION_KIND_LABELS[kind]}
          </Button>
        ))}
      </div>

      {sections.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-fg-muted)]">
          위 버튼으로 특성, 행동, 반응 등을 추가하세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sections.map((section, index) => (
            <li key={index} className="rounded-lg border border-[var(--color-border)] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="accent">{SECTION_KIND_LABELS[section.kind]}</Badge>
                <div className="ml-auto flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="위로 이동" className="h-8 w-8" onClick={() => move(index, -1)} disabled={index === 0}>
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="아래로 이동"
                    className="h-8 w-8"
                    onClick={() => move(index, 1)}
                    disabled={index === sections.length - 1}
                  >
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="항목 삭제"
                    className="h-8 w-8"
                    onClick={() => onChange(sections.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Field label="이름">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={section.name}
                      onChange={(e) =>
                        onChange(sections.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)))
                      }
                    />
                  )}
                </Field>
                <Field label="설명" hint="굵게(Ctrl+B) · 기울임(Ctrl+I) 등 서식을 쓸 수 있습니다.">
                  {() => (
                    <Suspense fallback={<div className="rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">편집기를 불러오는 중…</div>}>
                      <InlineRichText
                        ariaLabel="설명"
                        value={section.description}
                        onChange={(html) =>
                          onChange(sections.map((s, i) => (i === index ? { ...s, description: html } : s)))
                        }
                      />
                    </Suspense>
                  )}
                </Field>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
