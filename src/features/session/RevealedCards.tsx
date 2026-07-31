import { useState } from 'react';
import { Maximize2, X } from 'lucide-react';
import { useVisibleCards } from '@/hooks/queries';
import { EmptyState, Badge } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { CardImage } from '@/components/ui/CardImage';
import { FormattedText } from '@/components/ui/FormattedText';
import { Dialog } from '@/components/ui/Dialog';
import { RichTextView } from '@/features/editor/RichTextView';
import { HpBar } from '@/components/ui/HpBar';
import { CARD_TYPE_LABELS, ABILITY_LABELS, type AbilityKey } from '@/data/types';
import { abilityModifier, formatModifier } from '@/domain/abilities';
import type { VisibleCard } from '@/domain/reveal';

/**
 * 공개된 자료 목록.
 * 던전 마스터의 화면에서도 "실제로 공개 중인" 카드만 보이도록 비공개 카드를 걸러낸다.
 * (DM 투영은 전체 카드를 반환하므로 여기서 한 번 더 필터링한다.)
 */
export function RevealedCards({ campaignId }: { campaignId: string }) {
  const { data: allCards = [], isLoading } = useVisibleCards(campaignId);
  const cards = allCards.filter((card) => card.reveal_scope !== 'hidden');
  const [detail, setDetail] = useState<VisibleCard | null>(null);

  if (isLoading) return <div className="h-24 animate-soft-pulse rounded-lg bg-[var(--color-surface-3)]" aria-hidden />;

  if (cards.length === 0) {
    return <EmptyState title="공개된 자료가 없습니다" description="던전 마스터가 자료를 공개하면 여기에 바로 표시됩니다." />;
  }

  return (
    <>
      <ul data-testid="revealed-cards" className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              onClick={() => setDetail(card)}
              className="flex w-full flex-col gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-left"
            >
              {card.image_url ? (
                <CardImage src={card.image_url} alt={card.name ?? ''} maxHeight={200} className="w-full" />
              ) : null}
              <div className="flex items-center gap-2">
                <span className="font-medium">{card.name ?? '???'}</span>
                <Badge>{CARD_TYPE_LABELS[card.type]}</Badge>
                <Maximize2 aria-hidden className="ml-auto h-4 w-4 text-[var(--color-fg-muted)]" />
              </div>
              {card.summary ? <p className="line-clamp-2 text-sm text-[var(--color-fg-muted)]">{card.summary}</p> : null}
              {card.hp_tier ? <HpBar hp={card.stats?.hp ?? null} maxHp={card.stats?.max_hp ?? null} tier={card.hp_tier} size="sm" /> : null}
            </button>
          </li>
        ))}
      </ul>

      {detail ? <CardDetailDialog card={detail} onClose={() => setDetail(null)} /> : null}
    </>
  );
}

function CardDetailDialog({ card, onClose }: { card: VisibleCard; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <Dialog open onClose={onClose} title={card.name ?? '공개된 자료'} size="lg">
      <div className="flex flex-col gap-4">
        {card.image_url ? (
          <CardImage
            src={card.image_url}
            alt={card.name ?? ''}
            maxHeight={420}
            className="w-full"
            clickLabel="이미지 확대"
            onClick={() => setZoomed(true)}
          />
        ) : null}

        {card.summary ? <p className="text-sm text-[var(--color-fg-muted)]">{card.summary}</p> : null}

        {card.stats ? (
          <dl className="flex flex-wrap gap-3 rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
            {card.stats.ac !== undefined ? (
              <div>
                <dt className="text-xs text-[var(--color-fg-muted)]">방어도</dt>
                <dd className="font-semibold">{card.stats.ac}</dd>
              </div>
            ) : null}
            {card.stats.hp !== undefined ? (
              <div>
                <dt className="text-xs text-[var(--color-fg-muted)]">현재 HP</dt>
                <dd className="font-semibold">
                  {card.stats.hp}
                  {card.stats.max_hp !== undefined ? ` / ${card.stats.max_hp}` : ''}
                </dd>
              </div>
            ) : null}
            {card.stats.cr !== undefined ? (
              <div>
                <dt className="text-xs text-[var(--color-fg-muted)]">도전 등급</dt>
                <dd className="font-semibold">{card.stats.cr}</dd>
              </div>
            ) : null}
            {card.stats.speeds ? (
              <div>
                <dt className="text-xs text-[var(--color-fg-muted)]">이동 속도</dt>
                <dd className="font-semibold">{card.stats.speeds.walk}피트</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {card.stats?.abilities ? (
          <div className="grid grid-cols-6 gap-2">
            {(Object.keys(ABILITY_LABELS) as AbilityKey[]).map((key) => (
              <div key={key} className="rounded-lg border border-[var(--color-border)] p-2 text-center">
                <span className="block text-xs text-[var(--color-fg-muted)]">{ABILITY_LABELS[key]}</span>
                <span className="block font-semibold">{card.stats?.abilities?.[key]}</span>
                <span className="text-xs text-[var(--color-fg-muted)]">
                  {formatModifier(abilityModifier(card.stats?.abilities?.[key] ?? 10))}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {card.body ? <RichTextView doc={card.body} /> : null}

        {card.sections && card.sections.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {card.sections.map((section) => (
              <li key={section.id} className="rounded-lg bg-[var(--color-surface-2)] p-2.5 text-sm">
                <strong>{section.name}.</strong>
                <FormattedText value={section.description} className="mt-0.5" />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {zoomed && card.image_url ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4">
          <img src={card.image_url} alt={card.name ?? ''} className="max-h-full max-w-full object-contain" />
          <Button variant="secondary" size="icon" className="absolute right-4 top-4" aria-label="확대 닫기" onClick={() => setZoomed(false)}>
            <X aria-hidden className="h-5 w-5" />
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
