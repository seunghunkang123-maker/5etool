import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Pencil, Plus, Search, Star, Swords } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCards } from '@/hooks/queries';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { runOrToast, toUserMessage } from '@/lib/errors';
import { CARD_TYPE_LABELS, REVEAL_SCOPE_LABELS, type Card } from '@/data/types';
import { RevealDialog } from '@/features/library/RevealControl';
import { CardEditor } from '@/features/library/CardEditor';
import { CreateCardDialog } from '@/features/library/CreateCardDialog';
import { useShortcuts } from '@/hooks/useShortcuts';

/**
 * 세션 중 자료를 빠르게 찾아 바로 공개하는 패널.
 *
 * 검색 결과에서 1클릭으로 공개/비공개를 전환하고, 몬스터를 전투에 넣고,
 * 세션을 벗어나지 않고 카드를 바로 고치거나 새로 만들 수 있다.
 * (예전에는 자료를 고치려면 세션을 나갔다가 보관함을 거쳐 되돌아와야 했다.)
 */
export function QuickLibraryPanel({
  campaignId,
  sessionId,
  encounterId,
  onAddToCombat,
}: {
  campaignId: string;
  sessionId: string;
  encounterId: string | null;
  onAddToCombat: (card: Card) => Promise<void>;
}) {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [revealing, setRevealing] = useState<Card | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: cards = [], error } = useCards(campaignId, {
    query: query || undefined,
    favoritesOnly: favoritesOnly || undefined,
  });

  useShortcuts([{ combo: 'mod+k', allowInInput: true, handler: () => document.getElementById('session-search')?.focus() }]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['cards', campaignId] });
    void client.invalidateQueries({ queryKey: qk.visibleCards(campaignId) });
  };

  const toggleReveal = async (card: Card) => {
    if (card.reveal_scope === 'hidden') {
      setRevealing(card);
      return;
    }
    const ok = await runOrToast(() => repo().library.setReveal(card.id, { scope: 'hidden', sessionId }), toast.error);
    if (!ok) return;
    refresh();
    toast.success(`"${card.name}"을(를) 비공개로 되돌렸습니다.`);
  };

  return (
    <section aria-label="자료 보관함" className="flex h-full flex-col gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-fg-muted)]" />
        <label className="sr-only" htmlFor="session-search">
          자료 검색
        </label>
        <Input
          id="session-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="자료 검색 (Ctrl+K)"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant={favoritesOnly ? 'primary' : 'ghost'}
          onClick={() => setFavoritesOnly((v) => !v)}
          aria-pressed={favoritesOnly}
        >
          <Star aria-hidden className="h-4 w-4" />
          즐겨찾기
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
          <Plus aria-hidden className="h-4 w-4" />새 카드
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {toUserMessage(error, '자료를 불러오지 못했습니다.')}
        </p>
      ) : null}

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {cards.length === 0 ? (
          <EmptyState title="자료가 없습니다" description="여기서 바로 카드를 만들면 세션 중에 꺼내 쓸 수 있습니다." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {cards.slice(0, 100).map((card) => (
              <li key={card.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                {/* 이름을 누르면 바로 편집 창이 열린다. 세션 중 가장 잦은 동작이다. */}
                <button
                  type="button"
                  onClick={() => setEditing(card)}
                  aria-label={`${card.name} 편집`}
                  data-testid={`edit-${card.name}`}
                  className="flex w-full items-center gap-2 rounded text-left hover:bg-[var(--color-surface-2)]"
                >
                  {card.image_url ? (
                    <img src={card.image_url} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-cover" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-medium">
                      {card.name}
                      <Pencil aria-hidden className="h-3 w-3 shrink-0 text-[var(--color-fg-muted)]" />
                    </span>
                    <span className="flex gap-1 text-xs text-[var(--color-fg-muted)]">
                      <Badge>{CARD_TYPE_LABELS[card.type]}</Badge>
                      <Badge tone={card.reveal_scope === 'hidden' ? 'default' : 'success'}>{REVEAL_SCOPE_LABELS[card.reveal_scope]}</Badge>
                    </span>
                  </span>
                </button>

                <div className="mt-1.5 flex gap-1">
                  {encounterId && (card.type === 'monster' || card.type === 'npc') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="flex-1"
                      aria-label={`${card.name} 전투에 추가`}
                      onClick={() => void onAddToCombat(card)}
                    >
                      <Swords aria-hidden className="h-4 w-4" />
                      전투
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={card.reveal_scope === 'hidden' ? 'secondary' : 'primary'}
                    className="flex-1"
                    aria-label={card.reveal_scope === 'hidden' ? `${card.name} 공개` : `${card.name} 비공개로 전환`}
                    data-testid={`reveal-${card.name}`}
                    onClick={() => void toggleReveal(card)}
                  >
                    {card.reveal_scope === 'hidden' ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                    {card.reveal_scope === 'hidden' ? '공개' : '비공개'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {revealing ? (
        <RevealDialog
          card={revealing}
          campaignId={campaignId}
          sessionId={sessionId}
          onClose={() => setRevealing(null)}
          onSubmit={async (input) => {
            await repo().library.setReveal(revealing.id, input);
            refresh();
            toast.success(`"${revealing.name}"을(를) 공개했습니다.`);
          }}
        />
      ) : null}

      {editing ? (
        <CardEditor
          card={editing}
          campaignId={campaignId}
          onClose={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      {creating ? (
        <CreateCardDialog
          campaignId={campaignId}
          folderId={null}
          onClose={() => setCreating(false)}
          onCreated={(card) => {
            setCreating(false);
            refresh();
            // 만들자마자 편집 창을 열어 준다. 세션 중에는 한 번에 끝내는 편이 낫다.
            setEditing(card);
          }}
        />
      ) : null}
    </section>
  );
}
