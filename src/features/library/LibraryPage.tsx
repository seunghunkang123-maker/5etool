import { lazy, Suspense, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useDraggable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Copy, Eye, EyeOff, Filter, Plus, Search, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCards, useFolders, useTags, useViewer } from '@/hooks/queries';
import { useCampaignRealtime } from '@/hooks/useRealtime';
import { useShortcuts } from '@/hooks/useShortcuts';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Badge, CardListSkeleton, EmptyState, ErrorState } from '@/components/ui/feedback';
import { confirmAndRun, confirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { canEditAssets, canViewPrivateAssets } from '@/domain/permissions';
import { saveRecentSearch, loadRecentSearches, type CardFilter } from '@/domain/search';
import {
  CARD_TYPES,
  CARD_TYPE_LABELS,
  REVEAL_SCOPE_LABELS,
  type Card,
  type CardTemplate,
  type CardType,
  type Folder,
  type RevealScope,
  type UUID,
} from '@/data/types';
import { plainTextToDoc } from '@/domain/sanitize';
import { FolderTree } from './FolderTree';
import { RevealDialog } from './RevealControl';
import { CardEditor } from './CardEditor';
import { ConditionReferenceDialog } from '@/features/conditions/ConditionReferenceDialog';
import { useConditionReference } from '@/stores/conditionReference';
import { cn } from '@/lib/cn';

const MonsterGeneratorDialog = lazy(() => import('@/features/ai/MonsterGeneratorDialog').then((m) => ({ default: m.MonsterGeneratorDialog })));

export function LibraryPage() {
  const { campaignId = '' } = useParams();
  const client = useQueryClient();
  const { viewer } = useViewer(campaignId);
  const { data: folders = [] } = useFolders(campaignId);
  const { data: tags = [] } = useTags(campaignId);

  const [query, setQuery] = useState('');
  const [folderId, setFolderId] = useState<UUID | null | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<CardType[]>([]);
  const [tagFilter, setTagFilter] = useState<UUID[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<RevealScope[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<UUID[]>([]);
  const [editing, setEditing] = useState<Card | null>(null);
  const [revealing, setRevealing] = useState<Card | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename'; parentId: UUID | null; folder?: Folder } | null>(null);

  useCampaignRealtime(campaignId);

  const filter: CardFilter = useMemo(
    () => ({
      query: query || undefined,
      folderId,
      includeDescendants: true,
      types: typeFilter.length > 0 ? typeFilter : undefined,
      tagIds: tagFilter.length > 0 ? tagFilter : undefined,
      revealScopes: scopeFilter.length > 0 ? scopeFilter : undefined,
      favoritesOnly: favoritesOnly || undefined,
    }),
    [query, folderId, typeFilter, tagFilter, scopeFilter, favoritesOnly],
  );

  const { data: cards = [], isLoading, isError, refetch } = useCards(campaignId, filter);
  const { data: allCards = [] } = useCards(campaignId, undefined);

  const canEdit = canEditAssets(viewer);
  const canView = canViewPrivateAssets(viewer);

  const counts = useMemo(() => {
    const result: Record<string, number> = { __unfiled__: 0 };
    for (const card of allCards) {
      if (card.deleted_at || card.is_archived) continue;
      if (!card.folder_id) result.__unfiled__ = (result.__unfiled__ ?? 0) + 1;
      else result[card.folder_id] = (result[card.folder_id] ?? 0) + 1;
    }
    return result;
  }, [allCards]);

  useShortcuts([
    { combo: 'n', handler: () => canEdit && setCreating(true) },
    { combo: 'mod+k', allowInInput: true, handler: () => document.getElementById('library-search')?.focus() },
    {
      // 선택한 자료 공개. 여러 장을 골랐으면 한 번에 전체 공개로 바꾸고,
      // 한 장만 골랐으면 세부 설정을 할 수 있는 공개 다이얼로그를 연다.
      combo: 'mod+enter',
      allowInInput: true,
      handler: () => {
        if (!canEdit || selected.length === 0) return;
        if (selected.length === 1) {
          const card = cards.find((c) => c.id === selected[0]);
          if (card) setRevealing(card);
          return;
        }
        void bulkScope('full').catch((error) => toast.error(toUserMessage(error)));
      },
    },
  ]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['cards', campaignId] });
  };

  if (!canView) {
    return (
      <EmptyState
        title="자료 보관함은 던전 마스터 전용입니다"
        description="공개된 자료는 세션 화면에서 확인할 수 있습니다."
      />
    );
  }

  const onDragEnd = async (event: DragEndEvent) => {
    const cardId = String(event.active.id).replace('card-', '');
    const overId = event.over ? String(event.over.id) : null;
    if (!overId?.startsWith('folder-')) return;
    const target = overId.replace('folder-', '');
    const nextFolderId = target === '__unfiled__' || target === 'none' ? null : target;
    try {
      await repo().library.bulkUpdate([cardId], { folder_id: nextFolderId });
      refresh();
      toast.success('카드를 옮겼습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const bulkMove = async (nextFolderId: UUID | null) => {
    await repo().library.bulkUpdate(selected, { folder_id: nextFolderId });
    refresh();
    setSelected([]);
    toast.success(`${selected.length}개 카드를 옮겼습니다.`);
  };

  const bulkScope = async (scope: RevealScope) => {
    await repo().library.bulkUpdate(selected, { reveal_scope: scope });
    refresh();
    setSelected([]);
    toast.success(`${selected.length}개 카드의 공개 상태를 변경했습니다.`);
  };

  const deleteFolder = async (folder: Folder) => {
    const mode = await pickFolderDeleteMode();
    if (!mode) return;
    try {
      await repo().library.deleteFolder(folder.id, mode);
      void client.invalidateQueries({ queryKey: qk.folders(campaignId) });
      refresh();
      toast.success('폴더를 삭제했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4 lg:flex-row">
        <aside className="lg:w-64 lg:shrink-0">
          <FolderTree
            folders={folders}
            selectedId={folderId}
            onSelect={setFolderId}
            canEdit={canEdit}
            counts={counts}
            onCreate={(parentId) => setFolderDialog({ mode: 'create', parentId })}
            onRename={(folder) => setFolderDialog({ mode: 'rename', parentId: folder.parent_id, folder })}
            onDelete={deleteFolder}
          />

          {tags.length > 0 ? (
            <div className="mt-5">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">태그</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = tagFilter.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setTagFilter((prev) => (active ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]))}
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
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
              <label htmlFor="library-search" className="sr-only">
                자료 검색
              </label>
              <Input
                id="library-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onBlur={() => query && saveRecentSearch(query)}
                placeholder="이름, 본문, 태그, DM 메모 검색 (Ctrl+K)"
                className="pl-9"
                type="search"
              />
            </div>
            <Button variant="secondary" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
              <Filter aria-hidden className="h-4 w-4" />
              필터
              {typeFilter.length + tagFilter.length + scopeFilter.length > 0 ? (
                <Badge tone="accent">{typeFilter.length + tagFilter.length + scopeFilter.length}</Badge>
              ) : null}
            </Button>
            {canEdit ? (
              <>
                <Button variant="secondary" onClick={() => useConditionReference.getState().show()}>
                  <Sparkles aria-hidden className="h-4 w-4" />
                  상태 도감
                </Button>
                <Button variant="secondary" onClick={() => setGenerating(true)}>
                  <Wand2 aria-hidden className="h-4 w-4" />
                  AI 몬스터
                </Button>
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden className="h-4 w-4" />새 카드
                </Button>
              </>
            ) : null}
          </header>

          {showFilters ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-fg-muted)]">카드 유형</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CARD_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={typeFilter.includes(type)}
                      onClick={() =>
                        setTypeFilter((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        typeFilter.includes(type)
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-fg-muted)]',
                      )}
                    >
                      {CARD_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-fg-muted)]">공개 상태</legend>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(REVEAL_SCOPE_LABELS) as RevealScope[]).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      aria-pressed={scopeFilter.includes(scope)}
                      onClick={() =>
                        setScopeFilter((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
                      }
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        scopeFilter.includes(scope)
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-fg-muted)]',
                      )}
                    >
                      {REVEAL_SCOPE_LABELS[scope]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Checkbox label="즐겨찾기만 보기" checked={favoritesOnly} onChange={(e) => setFavoritesOnly(e.target.checked)} />
              <RecentSearches onPick={setQuery} />
            </div>
          ) : null}

          {selected.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/8 px-3 py-2">
              <span className="text-sm font-medium">{selected.length}개 선택됨</span>
              <label className="sr-only" htmlFor="bulk-folder">
                일괄 폴더 이동
              </label>
              <Select id="bulk-folder" className="w-44" defaultValue="" onChange={(e) => void bulkMove(e.target.value || null)}>
                <option value="">폴더로 이동…</option>
                <option value="">미분류</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="secondary" onClick={() => void bulkScope('full')}>
                <Eye aria-hidden className="h-4 w-4" />
                전체 공개
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void bulkScope('hidden')}>
                <EyeOff aria-hidden className="h-4 w-4" />
                비공개
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                선택 해제
              </Button>
            </div>
          ) : null}

          {isLoading ? (
            <CardListSkeleton rows={5} />
          ) : isError ? (
            <ErrorState message="자료를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요." onRetry={() => void refetch()} />
          ) : cards.length === 0 ? (
            <EmptyState
              title={query ? '검색 결과가 없습니다' : '이 폴더에 자료가 없습니다'}
              description={query ? '다른 검색어를 시도하거나 필터를 해제해 보세요.' : '몬스터, NPC, 핸드아웃 등을 카드로 추가해 세션을 준비하세요.'}
              {...(canEdit && !query ? { action: { label: '새 카드 만들기', onClick: () => setCreating(true) } } : {})}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {cards.map((card) => (
                <CardRow
                  key={card.id}
                  card={card}
                  selected={selected.includes(card.id)}
                  canEdit={canEdit}
                  onToggleSelect={() =>
                    setSelected((prev) => (prev.includes(card.id) ? prev.filter((id) => id !== card.id) : [...prev, card.id]))
                  }
                  onEdit={() => setEditing(card)}
                  onReveal={() => setRevealing(card)}
                  onQuickHide={async () => {
                    await repo().library.setReveal(card.id, { scope: 'hidden' });
                    refresh();
                  }}
                  onToggleFavorite={async () => {
                    await repo().library.updateCard(card.id, { is_favorite: !card.is_favorite }, card.version);
                    refresh();
                  }}
                  onDuplicate={async () => {
                    await repo().library.duplicateCard(card.id);
                    refresh();
                    toast.success('카드를 복제했습니다.');
                  }}
                  onDelete={() =>
                    confirmAndRun(
                      {
                        title: `"${card.name}" 카드를 삭제할까요?`,
                        description: '휴지통으로 이동하며 30일 안에 복구할 수 있습니다.',
                        confirmLabel: '삭제',
                        danger: true,
                      },
                      async () => {
                        await repo().library.deleteCard(card.id);
                        refresh();
                      },
                      '카드를 휴지통으로 옮겼습니다.',
                    )
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConditionReferenceDialog campaignId={campaignId} />

      {editing ? <CardEditor card={editing} campaignId={campaignId} onClose={() => { setEditing(null); refresh(); }} /> : null}

      {revealing ? (
        <RevealDialog
          card={revealing}
          campaignId={campaignId}
          onClose={() => setRevealing(null)}
          onSubmit={async (input) => {
            await repo().library.setReveal(revealing.id, input);
            refresh();
            toast.success('공개 설정을 적용했습니다.');
          }}
        />
      ) : null}

      {creating ? (
        <CreateCardDialog
          campaignId={campaignId}
          folderId={typeof folderId === 'string' ? folderId : null}
          onClose={() => setCreating(false)}
          onCreated={(card) => {
            refresh();
            setCreating(false);
            setEditing(card);
          }}
        />
      ) : null}

      {generating ? (
        <Suspense fallback={null}>
          <MonsterGeneratorDialog
            campaignId={campaignId}
            folderId={typeof folderId === 'string' ? folderId : null}
            onClose={() => setGenerating(false)}
            onSaved={() => {
              refresh();
              setGenerating(false);
            }}
          />
        </Suspense>
      ) : null}

      {folderDialog ? (
        <FolderDialog
          campaignId={campaignId}
          config={folderDialog}
          onClose={() => setFolderDialog(null)}
          onDone={() => {
            void client.invalidateQueries({ queryKey: qk.folders(campaignId) });
            setFolderDialog(null);
          }}
        />
      ) : null}
    </DndContext>
  );
}

function CardRow({
  card,
  selected,
  canEdit,
  onToggleSelect,
  onEdit,
  onReveal,
  onQuickHide,
  onToggleFavorite,
  onDuplicate,
  onDelete,
}: {
  card: Card;
  selected: boolean;
  canEdit: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onReveal: () => void;
  onQuickHide: () => Promise<void>;
  onToggleFavorite: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `card-${card.id}`, disabled: !canEdit });
  const revealed = card.reveal_scope !== 'hidden';

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3',
        isDragging && 'opacity-50',
        selected && 'ring-2 ring-[var(--color-accent)]',
      )}
    >
      {canEdit ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`${card.name} 선택`}
          className="h-4 w-4 accent-[var(--color-accent)]"
        />
      ) : null}

      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {card.image_url ? (
          <img
            src={card.image_url}
            alt=""
            loading="lazy"
            className="h-11 w-11 shrink-0 rounded-lg bg-[var(--color-surface-3)] object-contain"
          />
        ) : (
          <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-3)] text-xs text-[var(--color-fg-muted)]">
            {CARD_TYPE_LABELS[card.type].slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium">{card.name}</span>
            {card.is_favorite ? <Star aria-label="즐겨찾기" className="h-3.5 w-3.5 fill-current text-[var(--color-warning)]" /> : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
            <Badge>{CARD_TYPE_LABELS[card.type]}</Badge>
            <Badge tone={revealed ? 'success' : 'default'}>{REVEAL_SCOPE_LABELS[card.reveal_scope]}</Badge>
            {card.is_temporary_reveal ? <Badge tone="warning">일시 공개</Badge> : null}
            <span className="truncate">{card.summary}</span>
          </span>
        </span>
      </button>

      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant={revealed ? 'primary' : 'secondary'}
            size="sm"
            onClick={revealed ? () => void onQuickHide() : onReveal}
            aria-label={revealed ? `${card.name} 비공개로 전환` : `${card.name} 공개 설정`}
          >
            {revealed ? <EyeOff aria-hidden className="h-4 w-4" /> : <Eye aria-hidden className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${card.name} 즐겨찾기`} onClick={() => void onToggleFavorite()}>
            <Star aria-hidden className={cn('h-4 w-4', card.is_favorite && 'fill-current text-[var(--color-warning)]')} />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${card.name} 복제`} onClick={() => void onDuplicate()}>
            <Copy aria-hidden className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`${card.name} 삭제`} onClick={onDelete}>
            <Trash2 aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function RecentSearches({ onPick }: { onPick: (query: string) => void }) {
  const recent = loadRecentSearches();
  if (recent.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase text-[var(--color-fg-muted)]">최근 검색어</p>
      <div className="flex flex-wrap gap-1.5">
        {recent.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onPick(item)}
            className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-fg-muted)]"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateCardDialog({
  campaignId,
  folderId,
  onClose,
  onCreated,
}: {
  campaignId: string;
  folderId: UUID | null;
  onClose: () => void;
  onCreated: (card: Card) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CardType>('monster');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);

  useMemo(() => {
    void repo().library.templates(campaignId).then(setTemplates);
  }, [campaignId]);

  const create = async () => {
    setBusy(true);
    try {
      const template = templates.find((t) => t.id === templateId);
      const card = await repo().library.createCard(campaignId, {
        type,
        name: name.trim() || '이름 없는 카드',
        folder_id: folderId,
        summary: template?.payload.summary ?? '',
        dm_notes: template?.payload.dm_notes ?? '',
        body: template?.payload.bodyText ? plainTextToDoc(template.payload.bodyText) : null,
        sections: (template?.payload.sections ?? []).map((s, i) => ({ ...s, sort_order: i })),
      });
      toast.success('카드를 만들었습니다.');
      onCreated(card);
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
      title="새 카드"
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
        <Field label="카드 이름" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="예: 얼음 호수의 기사"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
          )}
        </Field>
        <Field label="카드 유형">
          {({ id }) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as CardType)}>
              {CARD_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CARD_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="템플릿" hint="선택하면 기본 필드와 서식이 자동으로 채워집니다.">
          {({ id }) => (
            <Select
              id={id}
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const template = templates.find((t) => t.id === e.target.value);
                if (template) setType(template.card_type);
              }}
            >
              <option value="">사용 안 함</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--color-surface-2)] p-2.5 text-xs text-[var(--color-fg-muted)]">
          <Sparkles aria-hidden className="mt-0.5 h-3.5 w-3.5" />새 카드는 항상 <strong>비공개</strong>로 만들어집니다. 준비가 되면 공개
          범위를 설정하세요.
        </p>
      </div>
    </Dialog>
  );
}

function FolderDialog({
  campaignId,
  config,
  onClose,
  onDone,
}: {
  campaignId: string;
  config: { mode: 'create' | 'rename'; parentId: UUID | null; folder?: Folder };
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(config.folder?.name ?? '');
  const [color, setColor] = useState(config.folder?.color ?? '#7c3aed');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (config.mode === 'create') {
        await repo().library.createFolder(campaignId, { name, parent_id: config.parentId, color });
      } else if (config.folder) {
        await repo().library.updateFolder(config.folder.id, { name, color });
      }
      onDone();
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
      title={config.mode === 'create' ? '새 폴더' : '폴더 이름 변경'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="폴더 이름" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          )}
        </Field>
        <Field label="색상">
          {({ id }) => <Input id={id} type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20 p-1" />}
        </Field>
      </div>
    </Dialog>
  );
}

async function pickFolderDeleteMode(): Promise<'trash_cards' | 'move_up' | 'unfile' | null> {
  const keepCards = await confirmDialog({
    title: '폴더를 삭제할까요?',
    description: '폴더 안의 카드를 어떻게 처리할지 선택하세요. "카드 유지"를 선택하면 카드는 미분류로 이동합니다.',
    confirmLabel: '카드 유지 (미분류로 이동)',
    cancelLabel: '카드도 휴지통으로',
  });
  return keepCards ? 'unfile' : 'trash_cards';
}
