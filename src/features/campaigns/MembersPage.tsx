import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, RefreshCw, UserMinus } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaign, useMembers, useViewer } from '@/hooks/queries';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Badge, CardListSkeleton, ErrorState } from '@/components/ui/feedback';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { isOwner, ROLE_LABELS } from '@/domain/permissions';
import { PERMISSION_KEYS, PERMISSION_LABELS, type CampaignRole, type PermissionKey } from '@/data/types';
import { formatDate } from '@/lib/format';

export function MembersPage() {
  const { campaignId = '' } = useParams();
  const client = useQueryClient();
  const { data: campaign } = useCampaign(campaignId);
  const { data: members = [], isLoading, isError, refetch } = useMembers(campaignId);
  const { viewer } = useViewer(campaignId);
  const { data: invites = [] } = useQuery({
    queryKey: qk.campaignInvites(campaignId),
    queryFn: () => repo().campaigns.listInvites(campaignId),
    enabled: Boolean(campaignId),
  });

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<CampaignRole>('player');
  const [inviting, setInviting] = useState(false);

  const canManage = isOwner(viewer) || viewer?.permissions.manage_players === true;

  if (isLoading) return <CardListSkeleton rows={4} />;
  if (isError) return <ErrorState message="구성원을 불러오지 못했습니다." onRetry={() => void refetch()} />;

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviting(true);
    try {
      await repo().campaigns.invite(campaignId, email, role);
      await client.invalidateQueries({ queryKey: qk.campaignInvites(campaignId) });
      setEmail('');
      toast.success('초대를 보냈습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, nextRole: CampaignRole) => {
    try {
      await repo().campaigns.updateMember(campaignId, userId, { role: nextRole });
      await client.invalidateQueries({ queryKey: qk.members(campaignId) });
      toast.success('역할을 변경했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const togglePermission = async (userId: string, key: PermissionKey, value: boolean) => {
    try {
      await repo().campaigns.updateMember(campaignId, userId, { permissions: { [key]: value } });
      await client.invalidateQueries({ queryKey: qk.members(campaignId) });
    } catch (error) {
      toast.error(toUserMessage(error));
    }
  };

  const removeMember = (userId: string, name: string) =>
    confirmAndRun(
      {
        title: '구성원을 내보낼까요?',
        description: `${name} 님이 이 캠페인의 자료에 더 이상 접근할 수 없게 됩니다. 캐릭터 데이터는 보존됩니다.`,
        confirmLabel: '내보내기',
        danger: true,
      },
      async () => {
        await repo().campaigns.removeMember(campaignId, userId);
        await client.invalidateQueries({ queryKey: qk.members(campaignId) });
      },
      '구성원을 내보냈습니다.',
    );

  const regenerateCode = () =>
    confirmAndRun(
      {
        title: '참여 코드를 재발급할까요?',
        description: '기존 코드는 즉시 사용할 수 없게 됩니다. 이미 참여한 구성원에게는 영향이 없습니다.',
        confirmLabel: '재발급',
      },
      async () => {
        await repo().campaigns.regenerateJoinCode(campaignId);
        await client.invalidateQueries({ queryKey: qk.campaign(campaignId) });
      },
      '새 참여 코드를 발급했습니다.',
    );

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">구성원과 권한</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          공동 던전 마스터에게 필요한 권한만 개별적으로 부여할 수 있습니다.
        </p>
      </header>

      {canManage ? (
        <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
          <h2 className="text-sm font-semibold">참여 코드</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="rounded bg-[var(--color-surface)] px-3 py-1.5 font-mono text-lg font-bold tracking-widest">
              {campaign?.join_code}
            </code>
            <Button variant="secondary" size="sm" onClick={regenerateCode}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              재발급
            </Button>
          </div>

          <form onSubmit={invite} className="mt-5 flex flex-wrap items-end gap-2">
            <Field label="이메일로 초대" className="min-w-56 flex-1">
              {({ id }) => (
                <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="player@example.com" />
              )}
            </Field>
            <Field label="역할" className="w-44">
              {({ id }) => (
                <Select id={id} value={role} onChange={(e) => setRole(e.target.value as CampaignRole)}>
                  <option value="player">플레이어</option>
                  <option value="co_dm">공동 던전 마스터</option>
                  <option value="spectator">관전자</option>
                </Select>
              )}
            </Field>
            <Button type="submit" variant="secondary" loading={inviting} className="h-10">
              <Mail aria-hidden className="h-4 w-4" />
              초대 보내기
            </Button>
          </form>

          {invites.filter((i) => i.status === 'pending').length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--color-fg-muted)]">
              {invites
                .filter((i) => i.status === 'pending')
                .map((i) => (
                  <li key={i.id}>
                    {i.email} · {ROLE_LABELS[i.role]} · {formatDate(i.expires_at)}까지 유효
                  </li>
                ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold">구성원 {members.length}명</h2>
        <ul className="flex flex-col gap-3">
          {members.map((member) => (
            <li key={member.user_id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
                  >
                    {(member.profile?.display_name ?? '?').slice(0, 1)}
                  </span>
                  <div>
                    <p className="font-medium">{member.profile?.display_name ?? '알 수 없음'}</p>
                    <p className="text-xs text-[var(--color-fg-muted)]">{member.profile?.email}</p>
                  </div>
                  {member.role === 'owner' ? <Badge tone="accent">{ROLE_LABELS.owner}</Badge> : null}
                </div>

                {canManage && member.role !== 'owner' ? (
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                      {member.profile?.display_name} 역할
                    </label>
                    <Select
                      id={`role-${member.user_id}`}
                      value={member.role}
                      onChange={(e) => changeRole(member.user_id, e.target.value as CampaignRole)}
                      className="w-48"
                    >
                      <option value="player">플레이어</option>
                      <option value="co_dm">공동 던전 마스터</option>
                      <option value="spectator">관전자</option>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${member.profile?.display_name} 내보내기`}
                      onClick={() => removeMember(member.user_id, member.profile?.display_name ?? '구성원')}
                    >
                      <UserMinus aria-hidden className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {member.role === 'co_dm' && canManage ? (
                <fieldset className="mt-4 border-t border-[var(--color-border)] pt-3">
                  <legend className="sr-only">{member.profile?.display_name} 세부 권한</legend>
                  <p className="mb-2 text-xs font-medium text-[var(--color-fg-muted)]">세부 권한</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {PERMISSION_KEYS.map((key) => (
                      <Checkbox
                        key={key}
                        label={PERMISSION_LABELS[key]}
                        checked={member.permissions?.[key] === true}
                        onChange={(e) => togglePermission(member.user_id, key, e.target.checked)}
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
