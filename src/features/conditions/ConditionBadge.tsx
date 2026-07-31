import { useConditionReference } from '@/stores/conditionReference';
import { cn } from '@/lib/cn';

/**
 * 상태 효과 배지.
 *
 * 누르면 상태 효과 도감이 그 항목을 펼친 채로 열린다.
 * 플레이어도 같은 배지를 눌러 효과를 확인할 수 있다.
 * 스택이 2 이상이면 숫자를 함께 보여준다.
 */
export function ConditionBadge({
  conditionKey,
  name,
  stacks = 1,
  color,
  className,
}: {
  conditionKey: string;
  name: string;
  stacks?: number;
  color?: string | null;
  className?: string;
}) {
  const show = useConditionReference((s) => s.show);

  return (
    <button
      type="button"
      onClick={() => show(conditionKey)}
      aria-label={`${name}${stacks > 1 ? ` ${stacks}중첩` : ''} 효과 설명 보기`}
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
        'bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-2)]',
        className,
      )}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
    >
      {color ? <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} /> : null}
      {name}
      {stacks > 1 ? (
        <span className="rounded-full bg-[var(--color-fg)]/10 px-1 font-mono font-semibold tabular-nums">
          {stacks}
        </span>
      ) : null}
    </button>
  );
}
