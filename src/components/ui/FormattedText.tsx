import { useMemo } from 'react';
import { textOrHtmlToHtml } from '@/domain/sanitize';
import { cn } from '@/lib/cn';

/**
 * 서식이 들어간 짧은 글을 보여준다.
 *
 * 특성·장비처럼 원래 평문이던 칸은 값에 HTML이 있을 수도, 평문일 수도 있다.
 * 두 경우를 같은 규칙으로 처리하고 항상 정화한 뒤 넣는다.
 */
export function FormattedText({
  value,
  className,
  emptyLabel,
}: {
  value: string | null | undefined;
  className?: string;
  emptyLabel?: string;
}) {
  const html = useMemo(() => textOrHtmlToHtml(value), [value]);

  if (!html) {
    return emptyLabel ? <span className={cn('text-[var(--color-fg-muted)]', className)}>{emptyLabel}</span> : null;
  }
  return <div className={cn('prose-app', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
