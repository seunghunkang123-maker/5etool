import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Printer, Sparkles } from 'lucide-react';
import { repo } from '@/data';
import { useGameSession, useSessionLogs, useViewer } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Field';
import { CardListSkeleton } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { isDM } from '@/domain/permissions';
import { emptySummary } from '@/data/defaults';
import { formatDateTime, formatElapsed, formatTime } from '@/lib/format';
import { downloadText, printHtml } from '@/lib/download';
import { escapeHtml } from '@/domain/sanitize';
import type { SessionSummary } from '@/data/types';

const SUMMARY_FIELDS: [keyof SessionSummary, string][] = [
  ['highlights', '주요 사건'],
  ['npcs', '등장 NPC'],
  ['locations', '방문 장소'],
  ['loot', '획득 아이템'],
  ['quests_completed', '완료한 퀘스트'],
  ['quests_new', '새 퀘스트'],
  ['combat_result', '전투 결과'],
  ['next_goals', '다음 세션 목표'],
];

export function SessionRecapPage() {
  const { campaignId = '', sessionId = '' } = useParams();
  const { data: session, isLoading } = useGameSession(sessionId);
  const { data: logs = [] } = useSessionLogs(sessionId);
  const { viewer } = useViewer(campaignId);
  const dm = isDM(viewer);

  const [summary, setSummary] = useState<SessionSummary>(emptySummary());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session?.summary) setSummary(session.summary);
  }, [session?.summary]);

  if (isLoading || !session) return <CardListSkeleton rows={4} />;

  const duration = session.started_at && session.ended_at ? new Date(session.ended_at).getTime() - new Date(session.started_at).getTime() : 0;

  const save = async () => {
    setBusy(true);
    try {
      await repo().sessions.saveSummary(sessionId, summary);
      toast.success('세션 요약을 저장했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const generateDraft = async () => {
    setBusy(true);
    try {
      const draft = await repo().sessions.generateSummaryDraft(sessionId);
      if (draft) setSummary({ ...summary, ...draft });
      toast.info('로그를 바탕으로 초안을 만들었습니다. 내용을 다듬어 주세요.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = () => {
    const lines = [
      `# ${session.title}`,
      '',
      `- 시작: ${formatDateTime(session.started_at)}`,
      `- 종료: ${formatDateTime(session.ended_at)}`,
      `- 진행 시간: ${formatElapsed(duration)}`,
      '',
      ...SUMMARY_FIELDS.flatMap(([key, label]) => [`## ${label}`, summary[key] || '(작성되지 않음)', '']),
      '## 세션 로그',
      ...logs.filter((l) => l.visibility === 'all').map((l) => `- ${formatTime(l.created_at)} ${l.message}`),
    ];
    downloadText(`${session.title}-요약.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  };

  const print = () => {
    const html = [
      `<h1>${escapeHtml(session.title)}</h1>`,
      `<p>${escapeHtml(formatDateTime(session.started_at))} — ${escapeHtml(formatDateTime(session.ended_at))} (${escapeHtml(formatElapsed(duration))})</p>`,
      ...SUMMARY_FIELDS.map(([key, label]) => `<h2>${escapeHtml(label)}</h2><p>${escapeHtml(summary[key] || '(작성되지 않음)')}</p>`),
    ].join('');
    printHtml(session.title, html);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{session.title} — 세션 기록</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          {formatDateTime(session.started_at)} 시작 · {formatElapsed(duration)} 진행 · 로그 {logs.length}건
        </p>
      </header>

      {dm ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={generateDraft} loading={busy}>
              <Sparkles aria-hidden className="h-4 w-4" />
              로그로 초안 만들기
            </Button>
            <Button variant="secondary" onClick={exportMarkdown}>
              <Download aria-hidden className="h-4 w-4" />
              Markdown 내보내기
            </Button>
            <Button variant="secondary" onClick={print}>
              <Printer aria-hidden className="h-4 w-4" />
              인쇄 / PDF 저장
            </Button>
          </div>

          {SUMMARY_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              {({ id }) => (
                <Textarea id={id} rows={3} value={summary[key]} onChange={(e) => setSummary({ ...summary, [key]: e.target.value })} />
              )}
            </Field>
          ))}

          <Field label="던전 마스터 비공개 메모" hint="플레이어에게 공유되지 않습니다.">
            {({ id }) => <Textarea id={id} rows={4} value={summary.dm_notes} onChange={(e) => setSummary({ ...summary, dm_notes: e.target.value })} />}
          </Field>

          <Button variant="primary" onClick={save} loading={busy} className="self-start">
            요약 저장
          </Button>
        </section>
      ) : (
        <section className="flex flex-col gap-4">
          {SUMMARY_FIELDS.map(([key, label]) =>
            summary[key] ? (
              <div key={key}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{label}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm">{summary[key]}</p>
              </div>
            ) : null,
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">세션 로그</h2>
        <ol className="scroll-area max-h-96 divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          {logs.map((log) => (
            <li key={log.id} className="flex gap-2 px-3 py-1.5 text-sm">
              <time className="shrink-0 font-mono text-xs text-[var(--color-fg-muted)]">{formatTime(log.created_at)}</time>
              <span className={log.undone ? 'text-[var(--color-fg-muted)] line-through' : ''}>{log.message}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
