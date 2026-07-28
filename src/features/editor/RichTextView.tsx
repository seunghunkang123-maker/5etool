import { useMemo } from 'react';
import type { RichDoc } from '@/data/types';
import { docToHtml } from '@/domain/sanitize';
import { cn } from '@/lib/cn';

/**
 * 리치 텍스트 읽기 전용 렌더러.
 * 저장된 JSON을 HTML로 바꾼 뒤 DOMPurify로 정화해서 삽입한다.
 */
export function RichTextView({ doc, className, emptyLabel = '내용이 없습니다.' }: { doc: RichDoc | null | undefined; className?: string; emptyLabel?: string }) {
  const html = useMemo(() => docToHtml(doc), [doc]);
  if (!html) return <p className={cn('text-sm text-[var(--color-fg-muted)]', className)}>{emptyLabel}</p>;
  return <div className={cn('prose-app', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
