import { hpTier, HP_TIER_LABELS, type HpTier } from '@/domain/hp';
import { cn } from '@/lib/cn';

/**
 * HP 표시.
 * 색상만으로 상태를 구분하지 않고 항상 텍스트 라벨을 함께 제공한다(접근성).
 */

const TIER_COLORS: Record<HpTier, string> = {
  healthy: 'bg-[var(--color-success)]',
  bruised: 'bg-[var(--color-success)]/70',
  wounded: 'bg-[var(--color-warning)]',
  critical: 'bg-[var(--color-danger)]',
  down: 'bg-[var(--color-fg-muted)]',
};

const TIER_TEXT: Record<HpTier, string> = {
  healthy: 'text-[var(--color-success)]',
  bruised: 'text-[var(--color-success)]',
  wounded: 'text-[var(--color-warning)]',
  critical: 'text-[var(--color-danger)]',
  down: 'text-[var(--color-fg-muted)]',
};

interface HpBarProps {
  hp: number | null;
  maxHp: number | null;
  tempHp?: number | null;
  /** 숫자를 감출 때 표시할 부상 단계 */
  tier?: HpTier;
  size?: 'sm' | 'md';
  className?: string;
}

export function HpBar({ hp, maxHp, tempHp, tier, size = 'md', className }: HpBarProps) {
  const showNumbers = hp !== null && maxHp !== null && maxHp > 0;
  const currentTier = tier ?? (showNumbers ? hpTier(hp, maxHp) : 'healthy');
  const percent = showNumbers ? Math.min(100, Math.max(0, (hp / maxHp) * 100)) : tierPercent(currentTier);
  const tempPercent = showNumbers && tempHp ? Math.min(100 - percent, (tempHp / maxHp) * 100) : 0;

  const label = showNumbers
    ? `HP ${hp} / ${maxHp}${tempHp ? ` (임시 ${tempHp})` : ''} — ${HP_TIER_LABELS[currentTier]}`
    : `HP 상태: ${HP_TIER_LABELS[currentTier]}`;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn('font-medium', TIER_TEXT[currentTier])}>{HP_TIER_LABELS[currentTier]}</span>
        {showNumbers ? (
          <span className="tabular-nums text-[var(--color-fg-muted)]">
            {hp}
            {tempHp ? <span className="text-[var(--color-accent)]"> (+{tempHp})</span> : null} / {maxHp}
          </span>
        ) : null}
      </div>
      <div
        role="meter"
        aria-valuenow={showNumbers ? hp : undefined}
        aria-valuemin={0}
        aria-valuemax={showNumbers ? maxHp : undefined}
        aria-label={label}
        className={cn(
          'flex w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div className={cn('h-full transition-[width]', TIER_COLORS[currentTier])} style={{ width: `${percent}%` }} />
        {tempPercent > 0 ? (
          <div className="h-full bg-[var(--color-accent)]/70 transition-[width]" style={{ width: `${tempPercent}%` }} />
        ) : null}
      </div>
    </div>
  );
}

function tierPercent(tier: HpTier): number {
  switch (tier) {
    case 'healthy':
      return 100;
    case 'bruised':
      return 65;
    case 'wounded':
      return 40;
    case 'critical':
      return 15;
    case 'down':
      return 0;
  }
}
