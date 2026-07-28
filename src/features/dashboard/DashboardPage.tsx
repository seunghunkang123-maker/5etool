import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, KeyRound, Plus, Users } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaigns } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { CardListSkeleton, EmptyState, ErrorState, Badge } from '@/components/ui/feedback';
import { CAMPAIGN_STATUS_LABELS, type CampaignStatus } from '@/data/types';
import { ROLE_LABELS } from '@/domain/permissions';
import { formatDate, formatRelative } from '@/lib/format';
import { toUserMessage } from '@/lib/errors';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';

const STATUS_TONES: Record<CampaignStatus, 'default' | 'accent' | 'success' | 'warning'> = {
  planning: 'default',
  active: 'success',
  hiatus: 'warning',
  completed: 'accent',
  archived: 'default',
};

export function DashboardPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: campaigns, isLoading, isError, refetch, isRefetching } = useCampaigns();
  const { data: invites = [] } = useQuery({ queryKey: qk.invites, queryFn: () => repo().campaigns.myInvites() });

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const owned = (campaigns ?? []).filter((c) => c.my_role === 'owner' || c.my_role === 'co_dm');
  const joined = (campaigns ?? []).filter((c) => c.my_role === 'player' || c.my_role === 'spectator');

  const join = async (event: React.FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setJoinError(null);
    try {
      const campaign = await repo().campaigns.joinByCode(joinCode);
      await client.invalidateQueries({ queryKey: qk.campaigns });
      toast.success(`"${campaign.name}" 캠페인에 참여했습니다.`);
      setJoinCode('');
      navigate(`/campaigns/${campaign.id}`);
    } catch (error) {
      setJoinError(toUserMessage(error, '참여 코드를 확인해 주세요.'));
    } finally {
      setJoining(false);
    }
  };

  const respondInvite = async (inviteId: string, accept: boolean) => {
    try {
      await repo().campaigns.respondToInvite(inviteId, accept);
      await Promise.all([
        client.invalidateQueries({ queryKey: qk.invites }),
        client.invalidateQueries({ queryKey: qk.campaigns }),
      ]);
      toast.success(accept ? '캠페인에 참여했습니다.' : '초대를 거절했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-fg)]">대시보드</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">진행 중인 캠페인과 예정된 세션을 확인하세요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => navigate('/campaigns/new')}>
            <Plus aria-hidden className="h-4 w-4" />새 캠페인
          </Button>
        </div>
      </section>

      {invites.length > 0 ? (
        <section aria-labelledby="invites-heading" className="rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/5 p-4">
          <h2 id="invites-heading" className="text-sm font-semibold text-[var(--color-fg)]">
            받은 초대 {invites.length}건
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-surface)] px-3 py-2">
                <span className="text-sm">
                  <strong>{invite.campaign_name || '캠페인'}</strong>
                  <span className="text-[var(--color-fg-muted)]"> · {ROLE_LABELS[invite.role]}로 초대</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => respondInvite(invite.id, false)}>
                    거절
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => respondInvite(invite.id, true)}>
                    수락
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="join-heading" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h2 id="join-heading" className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound aria-hidden className="h-4 w-4" />
          참여 코드로 입장
        </h2>
        <form onSubmit={join} className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="참여 코드" error={joinError ?? undefined} className="min-w-48 flex-1">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="예: A3F9KQ"
                maxLength={12}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                className="uppercase"
              />
            )}
          </Field>
          <Button type="submit" variant="secondary" loading={joining} className="h-10">
            참여하기
          </Button>
        </form>
      </section>

      {isLoading ? (
        <CardListSkeleton rows={3} />
      ) : isError ? (
        <ErrorState message="캠페인 목록을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요." onRetry={() => void refetch()} retrying={isRefetching} />
      ) : (campaigns ?? []).length === 0 ? (
        <EmptyState
          title="아직 캠페인이 없습니다"
          description="새 캠페인을 만들어 자료를 정리하거나, 던전 마스터에게 받은 참여 코드를 입력해 참여하세요."
          action={{ label: '새 캠페인 만들기', onClick: () => navigate('/campaigns/new') }}
        />
      ) : (
        <>
          <CampaignSection title="내가 운영하는 캠페인" campaigns={owned} />
          <CampaignSection title="내가 참여하는 캠페인" campaigns={joined} />
        </>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  campaigns: ReturnType<typeof useCampaigns>['data'];
}

function CampaignSection({ title, campaigns }: SectionProps) {
  if (!campaigns || campaigns.length === 0) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((campaign) => (
          <li key={campaign.id}>
            <Link
              to={`/campaigns/${campaign.id}`}
              className={cn(
                'flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]',
                'transition-shadow hover:shadow-md',
              )}
            >
              <div
                className="h-24 w-full bg-[var(--color-surface-3)] bg-cover bg-center"
                style={campaign.cover_url ? { backgroundImage: `url(${campaign.cover_url})` } : { backgroundColor: campaign.theme_color }}
                aria-hidden
              />
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-[var(--color-fg)]">{campaign.name}</h3>
                  <Badge tone={STATUS_TONES[campaign.status]}>{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
                </div>
                <p className="line-clamp-2 text-sm text-[var(--color-fg-muted)]">{campaign.description || '설명이 없습니다.'}</p>
                <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-fg-muted)]">
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">던전 마스터</dt>
                    <dd>DM {campaign.owner_name}</dd>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users aria-hidden className="h-3.5 w-3.5" />
                    <dt className="sr-only">참가 인원</dt>
                    <dd>{campaign.member_count}명</dd>
                  </div>
                  {campaign.next_session_at ? (
                    <div className="flex items-center gap-1">
                      <CalendarClock aria-hidden className="h-3.5 w-3.5" />
                      <dt className="sr-only">다음 예정 세션</dt>
                      <dd>{formatDate(campaign.next_session_at)}</dd>
                    </div>
                  ) : campaign.last_session_at ? (
                    <div>
                      <dt className="sr-only">최근 세션</dt>
                      <dd>최근 {formatRelative(campaign.last_session_at)}</dd>
                    </div>
                  ) : null}
                </dl>
                <span className="text-sm font-medium text-[var(--color-accent)]">입장하기 →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
