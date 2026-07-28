import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Copy, Play, Plus, Settings, Users } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaign, useMembers, useSessions, useViewer } from '@/hooks/queries';
import { useCampaignRealtime } from '@/hooks/useRealtime';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Badge, CardListSkeleton, EmptyState, ErrorState } from '@/components/ui/feedback';
import { CAMPAIGN_STATUS_LABELS, SESSION_STATUS_LABELS, type GameSession } from '@/data/types';
import { isDM, ROLE_LABELS } from '@/domain/permissions';
import { formatDateTime, fromDateTimeLocal } from '@/lib/format';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';

export function CampaignPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId);
  const { data: sessions = [] } = useSessions(campaignId);
  const { data: members = [] } = useMembers(campaignId);
  const { viewer } = useViewer(campaignId);
  const [creating, setCreating] = useState(false);
  useCampaignRealtime(campaignId);

  const dm = isDM(viewer);

  if (isLoading) return <CardListSkeleton rows={3} />;
  if (isError || !campaign) {
    return <ErrorState message="캠페인을 불러오지 못했습니다. 주소가 올바른지 확인해 주세요." onRetry={() => void refetch()} />;
  }

  const live = sessions.find((s) => s.status === 'live');

  const copyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(campaign.join_code);
      toast.success('참여 코드를 복사했습니다.');
    } catch {
      toast.info(`참여 코드: ${campaign.join_code}`);
    }
  };

  const startSession = async (session: GameSession) => {
    try {
      await repo().sessions.start(session.id);
      await client.invalidateQueries({ queryKey: qk.sessions(campaign.id) });
      navigate(`/campaigns/${campaign.id}/sessions/${session.id}`);
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{campaign.name}</h1>
            <Badge tone={campaign.status === 'active' ? 'success' : 'default'}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
            {viewer ? <Badge tone="accent">{ROLE_LABELS[viewer.role]}</Badge> : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-fg-muted)]">{campaign.description || '설명이 없습니다.'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/campaigns/${campaign.id}/library`)}>
            <BookOpen aria-hidden className="h-4 w-4" />
            자료 보관함
          </Button>
          <Button variant="secondary" onClick={() => navigate(`/campaigns/${campaign.id}/characters`)}>
            캐릭터
          </Button>
          {dm ? (
            <>
              <Button variant="secondary" onClick={() => navigate(`/campaigns/${campaign.id}/members`)}>
                <Users aria-hidden className="h-4 w-4" />
                구성원
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/campaigns/${campaign.id}/settings`)}>
                <Settings aria-hidden className="h-4 w-4" />
                설정
              </Button>
            </>
          ) : null}
        </div>
      </header>

      {dm ? (
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-3">
          <span className="text-sm text-[var(--color-fg-muted)]">참여 코드</span>
          <code data-testid="join-code" className="rounded bg-[var(--color-surface)] px-3 py-1 font-mono text-lg font-bold tracking-widest">
            {campaign.join_code}
          </code>
          <Button variant="ghost" size="sm" onClick={copyJoinCode}>
            <Copy aria-hidden className="h-4 w-4" />
            복사
          </Button>
          <span className="text-xs text-[var(--color-fg-muted)]">
            플레이어는 대시보드에서 이 코드를 입력해 참여합니다.
          </span>
        </section>
      ) : null}

      {live ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-success)]/50 bg-[var(--color-success)]/10 px-4 py-3">
          <p className="text-sm font-medium">
            진행 중인 세션: <strong>{live.title}</strong>
          </p>
          <Button variant="primary" onClick={() => navigate(`/campaigns/${campaign.id}/sessions/${live.id}`)}>
            세션 입장
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="sessions-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="sessions-heading" className="text-lg font-semibold">
            세션
          </h2>
          {dm ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="h-4 w-4" />새 세션
            </Button>
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <EmptyState
            title="아직 세션이 없습니다"
            description={dm ? '첫 세션을 만들고 바로 시작해 보세요.' : '던전 마스터가 세션을 열면 여기에 표시됩니다.'}
            {...(dm ? { action: { label: '새 세션 만들기', onClick: () => setCreating(true) } } : {})}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="text-[var(--color-fg-muted)]">#{session.session_number}</span>
                    {session.title}
                    <Badge tone={session.status === 'live' ? 'success' : session.status === 'ended' ? 'default' : 'accent'}>
                      {SESSION_STATUS_LABELS[session.status]}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {session.scheduled_at ? `예정 ${formatDateTime(session.scheduled_at)}` : '일정 미정'}
                    {session.ended_at ? ` · 종료 ${formatDateTime(session.ended_at)}` : ''}
                  </p>
                </div>

                <div className="flex gap-2">
                  {session.status === 'ended' ? (
                    <Link
                      to={`/campaigns/${campaign.id}/sessions/${session.id}/recap`}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-surface-2)]"
                    >
                      기록 보기
                    </Link>
                  ) : session.status === 'live' ? (
                    <Button variant="primary" size="sm" onClick={() => navigate(`/campaigns/${campaign.id}/sessions/${session.id}`)}>
                      입장
                    </Button>
                  ) : dm ? (
                    <Button variant="primary" size="sm" onClick={() => startSession(session)}>
                      <Play aria-hidden className="h-4 w-4" />
                      세션 시작
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-lg font-semibold">
          참가자 ({members.length}명)
        </h2>
        <ul className="flex flex-wrap gap-2">
          {members.map((member) => (
            <li
              key={member.user_id}
              className="flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-xs font-semibold text-[var(--color-accent-fg)]"
              >
                {(member.profile?.display_name ?? '?').slice(0, 1)}
              </span>
              {member.profile?.display_name ?? '알 수 없음'}
              <span className="text-xs text-[var(--color-fg-muted)]">{ROLE_LABELS[member.role]}</span>
            </li>
          ))}
        </ul>
      </section>

      {creating ? <CreateSessionDialog campaignId={campaign.id} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateSessionDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (startNow: boolean) => {
    setBusy(true);
    try {
      const session = await repo().sessions.create(campaignId, {
        title,
        description,
        scheduled_at: fromDateTimeLocal(scheduledAt),
        status: startNow ? 'preparing' : 'scheduled',
      });
      if (startNow) await repo().sessions.start(session.id);
      await client.invalidateQueries({ queryKey: qk.sessions(campaignId) });
      toast.success(startNow ? '세션을 시작했습니다.' : '세션을 만들었습니다.');
      onClose();
      if (startNow) navigate(`/campaigns/${campaignId}/sessions/${session.id}`);
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
      title="새 세션"
      description="예정된 세션으로 만들거나 지금 바로 시작할 수 있습니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="secondary" loading={busy} onClick={() => create(false)}>
            예정 세션으로 저장
          </Button>
          <Button variant="primary" loading={busy} onClick={() => create(true)}>
            <Play aria-hidden className="h-4 w-4" />
            바로 시작
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="세션 제목" hint="비워 두면 회차 번호로 자동 생성됩니다.">
          {({ id }) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 얼음 호수의 비밀" autoFocus />}
        </Field>
        <Field label="예정 일시">
          {({ id }) => <Input id={id} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />}
        </Field>
        <Field label="세션 설명">
          {({ id }) => <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
