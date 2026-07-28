import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Search, Star, Swords } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCards } from '@/hooks/queries';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Badge, EmptyState } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { CARD_TYPE_LABELS, REVEAL_SCOPE_LABELS, type Card } from '@/data/types';
import { RevealDialog } from '@/features/library/RevealControl';
import { useShortcuts } from '@/hooks/useShortcuts';

/**
 * 세션 중 자료를 빠르게 찾아 바로 공개하는 패널.
 * 검색 결과에서 1클릭으로 공개/비공개를 전환할 수 있다.
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

  const { data: cards = [] } = useCards(campaignId, {
    query: query || undefined,
    favoritesOnly: favoritesOnly || undefined,
  });

  useShortcuts([{ combo: 'mod+k', allowInInput: true, handler: () => document.getElementById('session-search')?.focus() }]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['cards', campaignId] });
    void client.invalidateQueries({ queryKey: qk.visibleCards(campaignId) });
  };

  const toggleReveal = async (card: Card) => {
    try {
      if (card.reveal_scope === 'hidden') {
        setRevealing(card);
      } else {
        await repo().library.setReveal(card.id, { scope: 'hidden', sessionId });
        refresh();
        toast.success(`"${card.name}"을(를) 비공개로 되돌렸습니다.`);
      }
    } catch (error) {
      toast.error(toUserMessage(error));
    }
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

      <Button
        size="sm"
        variant={favoritesOnly ? 'primary' : 'ghost'}
        onClick={() => setFavoritesOnly((v) => !v)}
        aria-pressed={favoritesOnly}
        className="self-start"
      >
        <Star aria-hidden className="h-4 w-4" />
        즐겨찾기
      </Button>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
        {cards.length === 0 ? (
          <EmptyState title="자료가 없습니다" description="보관함에서 카드를 만들어 두면 세션 중 바로 꺼내 쓸 수 있습니다." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {cards.slice(0, 100).map((card) => (
              <li key={card.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
                <div className="flex items-center gap-2">
                  {card.image_url ? (
                    <img src={card.image_url} alt="" loading="lazy" className="h-8 w-8 rounded object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{card.name}</p>
                    <p className="flex gap-1 text-xs text-[var(--color-fg-muted)]">
                      <Badge>{CARD_TYPE_LABELS[card.type]}</Badge>
                      <Badge tone={card.reveal_scope === 'hidden' ? 'default' : 'success'}>{REVEAL_SCOPE_LABELS[card.reveal_scope]}</Badge>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {encounterId && (card.type === 'monster' || card.type === 'npc') ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`${card.name} 전투에 추가`}
                        onClick={() => void onAddToCombat(card)}
                      >
                        <Swords aria-hidden className="h-4 w-4" />
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant={card.reveal_scope === 'hidden' ? 'secondary' : 'primary'}
                      aria-label={card.reveal_scope === 'hidden' ? `${card.name} 공개` : `${card.name} 비공개로 전환`}
                      data-testid={`reveal-${card.name}`}
                      onClick={() => void toggleReveal(card)}
                    >
                      {card.reveal_scope === 'hidden' ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                    </Button>
                  </div>
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
    </section>
  );
}
