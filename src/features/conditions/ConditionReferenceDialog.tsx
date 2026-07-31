import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { repo } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Badge, EmptyState, LoadingBlock } from '@/components/ui/feedback';
import { useConditionReference } from '@/stores/conditionReference';
import { searchConditions, toEntries, type ConditionEntry } from '@/domain/conditionLibrary';
import { canEditAssets } from '@/domain/permissions';
import { useViewer } from '@/hooks/queries';
import { ConditionTemplateEditor } from './ConditionTemplateEditor';

/**
 * 상태 효과 조회 창.
 *
 * 플레이어를 포함한 캠페인 구성원 누구나 열 수 있다. 세션 중에 "이 상태가 뭐였지"를
 * 규칙책 없이 확인하는 것이 목적이다.
 * 편집 권한이 있으면 이 캠페인 전용 상태를 여기서 바로 추가·수정할 수 있다.
 */
export function ConditionReferenceDialog({ campaignId }: { campaignId: string }) {
  const { open, focusKey, close } = useConditionReference();
  const { viewer } = useViewer(campaignId);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ConditionEntry | 'new' | null>(null);

  const { data: conditions = [], isLoading, refetch } = useQuery({
    queryKey: ['condition-library', campaignId],
    queryFn: () => repo().combat.conditionLibrary(campaignId),
    enabled: open && Boolean(campaignId),
    staleTime: 60_000,
  });

  const entries = useMemo(() => toEntries(conditions), [conditions]);
  const results = useMemo(() => searchConditions(entries, query), [entries, query]);
  const canEdit = canEditAssets(viewer);

  // 배지를 눌러 특정 상태로 열면 검색어를 비우고 그 항목만 펼친다.
  useEffect(() => {
    if (open) setQuery('');
  }, [open, focusKey]);

  return (
    <>
      <Dialog
        open={open}
        onClose={close}
        title="상태 효과 도감"
        description="세션 중 걸린 상태의 효과를 확인합니다. 캠페인 전용 상태도 함께 나옵니다."
        size="lg"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="상태 이름이나 효과로 검색"
                aria-label="상태 효과 검색"
                className="pl-9"
              />
            </div>
            {canEdit ? (
              <Button variant="secondary" onClick={() => setEditing('new')}>
                <Plus aria-hidden className="h-4 w-4" />
                상태 추가
              </Button>
            ) : null}
          </div>

          {isLoading ? (
            <LoadingBlock label="상태 효과를 불러오는 중입니다" />
          ) : results.length === 0 ? (
            <EmptyState
              title="찾는 상태가 없습니다"
              description={
                canEdit
                  ? '검색어를 바꾸거나, 이 캠페인에서 쓰는 상태를 직접 추가해 보세요.'
                  : '검색어를 바꿔 보세요. 캠페인 전용 상태는 던전 마스터가 추가합니다.'
              }
            />
          ) : (
            <ul className="scroll-area flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
              {results.map((entry) => (
                <li key={entry.id}>
                  <details
                    open={entry.key === focusKey || results.length === 1}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
                  >
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-[var(--color-surface-2)]">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color ?? 'var(--color-accent)' }}
                      />
                      <span className="font-medium">{entry.name}</span>
                      {entry.isCustom ? <Badge tone="accent">캠페인 전용</Badge> : null}
                      {entry.isStackable ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-fg-muted)]">
                          <Layers aria-hidden className="h-3 w-3" />
                          누적
                        </span>
                      ) : null}
                      <span className="w-full truncate text-sm text-[var(--color-fg-muted)] sm:w-auto sm:flex-1">
                        {entry.summary}
                      </span>
                    </summary>

                    <div className="border-t border-[var(--color-border)] px-3 py-3">
                      {entry.details.length > 0 ? (
                        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
                          {entry.details.map((line, index) => (
                            <li key={index}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-[var(--color-fg-muted)]">
                          {entry.summary || '아직 설명이 없습니다.'}
                        </p>
                      )}

                      {canEdit && entry.isCustom ? (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(entry)}>
                            <Pencil aria-hidden className="h-4 w-4" />
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              await repo().combat.deleteConditionTemplate(entry.id);
                              await refetch();
                            }}
                          >
                            <Trash2 aria-hidden className="h-4 w-4" />
                            삭제
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}

          <p className="flex items-center gap-1.5 text-xs text-[var(--color-fg-muted)]">
            <BookOpen aria-hidden className="h-3.5 w-3.5" />
            전투 화면의 상태 배지를 눌러도 이 창이 열립니다.
          </p>
        </div>
      </Dialog>

      {editing ? (
        <ConditionTemplateEditor
          campaignId={campaignId}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refetch();
          }}
        />
      ) : null}
    </>
  );
}
