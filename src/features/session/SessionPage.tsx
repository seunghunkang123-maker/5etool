import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Dices, LogOut, Maximize, Shield, Swords, Timer as TimerIcon, User, Users, Wifi, WifiOff } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCampaign, useCharacters, useEncounter, useGameSession, useViewer } from '@/hooks/queries';
import { useConnectionStatus, useSessionRealtime, useUserRealtime } from '@/hooks/useRealtime';
import { useTick } from '@/hooks/useTick';
import { Button } from '@/components/ui/Button';
import { Badge, LoadingBlock } from '@/components/ui/feedback';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatElapsed } from '@/lib/format';
import { isDM } from '@/domain/permissions';
import { useAuthStore } from '@/stores/auth';
import { EncounterPanel } from '@/features/combat/EncounterPanel';
import { TimerPanel } from '@/features/timers/TimerPanel';
import { DicePanel } from '@/features/dice/DicePanel';
import { QuickLibraryPanel } from './QuickLibraryPanel';
import { RevealedCards } from './RevealedCards';
import { InitiativeTracker } from './InitiativeTracker';
import { SessionLogPanel } from './SessionLogPanel';
import { PartyBoard } from './PartyBoard';
import { CharacterSheet } from '@/features/characters/CharacterSheet';
import { CampaignAccent } from '@/features/campaigns/CampaignAccent';
import { SESSION_STATUS_LABELS } from '@/data/types';
import { cn } from '@/lib/cn';

type MobileTab = 'session' | 'character' | 'combat' | 'library' | 'dice';

export function SessionPage() {
  const { campaignId = '', sessionId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: session, isLoading } = useGameSession(sessionId);
  const { data: campaign } = useCampaign(campaignId);
  const { viewer } = useViewer(campaignId);
  const { data: encounter } = useEncounter(sessionId);
  const { data: participants = [] } = useQuery({
    queryKey: qk.participants(sessionId),
    queryFn: () => repo().sessions.participants(sessionId),
    enabled: Boolean(sessionId),
  });

  const connection = useConnectionStatus();
  useSessionRealtime(sessionId, campaignId, encounter?.id ?? null);
  useUserRealtime(user?.id);

  const [mobileTab, setMobileTab] = useState<MobileTab>('session');
  const dm = isDM(viewer);

  // 입장 기록
  useEffect(() => {
    if (sessionId) void repo().sessions.join(sessionId).catch(() => undefined);
  }, [sessionId]);

  if (isLoading || !session) return <LoadingBlock label="세션을 불러오는 중입니다" />;

  const endSession = () =>
    confirmAndRun(
      {
        title: '세션을 종료할까요?',
        description: '진행 중인 전투와 타이머가 정리되고, 일시 공개된 자료는 이전 상태로 돌아갑니다.',
        confirmLabel: '세션 종료',
      },
      async () => {
        await repo().sessions.end(sessionId);
        await client.invalidateQueries({ queryKey: qk.sessions(campaignId) });
        navigate(`/campaigns/${campaignId}/sessions/${sessionId}/recap`);
      },
      '세션을 종료했습니다.',
    );

  return (
    <div className="flex h-dvh flex-col bg-[var(--color-surface-2)]">
      <CampaignAccent />
      <SessionTopBar
        campaignName={campaign?.name ?? ''}
        sessionTitle={session.title}
        status={session.status}
        startedAt={session.started_at}
        connection={connection}
        participants={participants}
        isDM={dm}
        onEnd={endSession}
        onExit={() => navigate(`/campaigns/${campaignId}`)}
      />

      <div className="flex min-h-0 flex-1">
        {dm ? (
          <DmWorkspace campaignId={campaignId} sessionId={sessionId} mobileTab={mobileTab} />
        ) : (
          <PlayerWorkspace campaignId={campaignId} sessionId={sessionId} mobileTab={mobileTab} />
        )}
      </div>

      <MobileNav active={mobileTab} onChange={setMobileTab} isDM={dm} />
    </div>
  );
}

function SessionTopBar({
  campaignName,
  sessionTitle,
  status,
  startedAt,
  connection,
  participants,
  isDM: dm,
  onEnd,
  onExit,
}: {
  campaignName: string;
  sessionTitle: string;
  status: keyof typeof SESSION_STATUS_LABELS;
  startedAt: string | null;
  connection: 'connecting' | 'connected' | 'disconnected';
  participants: { user_id: string; display_name: string; is_online: boolean }[];
  isDM: boolean;
  onEnd: () => void;
  onExit: () => void;
}) {
  const now = useTick(30_000, Boolean(startedAt));
  const elapsed = startedAt ? now - new Date(startedAt).getTime() : 0;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{sessionTitle}</p>
        <p className="truncate text-xs text-[var(--color-fg-muted)]">{campaignName}</p>
      </div>

      <Badge tone={status === 'live' ? 'success' : 'default'}>{SESSION_STATUS_LABELS[status]}</Badge>
      {startedAt ? <span className="text-xs text-[var(--color-fg-muted)]">{formatElapsed(elapsed)} 진행</span> : null}

      <span
        className={cn(
          'flex items-center gap-1 text-xs',
          connection === 'connected' ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]',
        )}
        role="status"
        aria-live="polite"
      >
        {connection === 'connected' ? <Wifi aria-hidden className="h-3.5 w-3.5" /> : <WifiOff aria-hidden className="h-3.5 w-3.5" />}
        {connection === 'connected' ? '연결됨' : connection === 'connecting' ? '연결 중' : '연결 끊김 — 복구되면 자동으로 동기화됩니다'}
      </span>

      <span className="hidden items-center gap-1 text-xs text-[var(--color-fg-muted)] sm:flex">
        <Users aria-hidden className="h-3.5 w-3.5" />
        {participants.filter((p) => p.is_online).length}/{participants.length}명 접속
      </span>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="전체 화면" onClick={toggleFullscreen} className="hidden sm:inline-flex">
          <Maximize aria-hidden className="h-4 w-4" />
        </Button>
        {dm ? (
          <Button variant="secondary" size="sm" onClick={onEnd}>
            세션 종료
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onExit}>
          <LogOut aria-hidden className="h-4 w-4" />
          나가기
        </Button>
      </div>
    </header>
  );
}

function DmWorkspace({ campaignId, sessionId, mobileTab }: { campaignId: string; sessionId: string; mobileTab: MobileTab }) {
  const client = useQueryClient();
  const { data: encounter } = useEncounter(sessionId);

  const addCardToCombat = async (card: { id: string; name: string; image_url: string | null; type: string; stats?: { hp: number; max_hp: number; ac: number; abilities: { dex: number } } | null }) => {
    if (!encounter) {
      toast.warning('먼저 전투를 만들어 주세요.');
      return;
    }
    await repo().combat.addCombatant(encounter.id, {
      source_type: card.type === 'npc' ? 'npc' : 'monster',
      source_card_id: card.id,
      name: card.name,
      image_url: card.image_url,
      hp: card.stats?.hp ?? 10,
      max_hp: card.stats?.max_hp ?? 10,
      ac: card.stats?.ac ?? 12,
      dex_score: card.stats?.abilities.dex ?? 10,
    });
    void client.invalidateQueries({ queryKey: qk.combatants(encounter.id) });
    toast.success(`${card.name}을(를) 전투에 추가했습니다.`);
  };

  return (
    <>
      {/* 왼쪽 패널 — 자료 보관함 */}
      <aside
        className={cn(
          'w-72 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3',
          'hidden lg:block',
          mobileTab === 'library' && 'block w-full lg:w-72',
        )}
      >
        <QuickLibraryPanel campaignId={campaignId} sessionId={sessionId} encounterId={encounter?.id ?? null} onAddToCombat={addCardToCombat} />
      </aside>

      {/* 중앙 작업 공간 */}
      <main
        className={cn(
          'scroll-area min-w-0 flex-1 overflow-y-auto p-3 pb-20 lg:pb-3',
          mobileTab !== 'session' && mobileTab !== 'combat' ? 'hidden lg:block' : '',
        )}
      >
        <EncounterPanel sessionId={sessionId} campaignId={campaignId} />
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">플레이어에게 공개 중인 자료</h2>
          <RevealedCards campaignId={campaignId} />
        </div>
      </main>

      {/* 오른쪽 패널 */}
      <aside
        className={cn(
          'scroll-area w-80 shrink-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3',
          'hidden xl:block',
          (mobileTab === 'dice' || mobileTab === 'character') && 'block w-full xl:w-80',
        )}
      >
        <div className="flex flex-col gap-5 pb-20 xl:pb-0">
          <TimerPanel sessionId={sessionId} canManage />
          <DicePanel campaignId={campaignId} sessionId={sessionId} isDM />
          <SessionLogPanel sessionId={sessionId} canUndo />
        </div>
      </aside>
    </>
  );
}

function PlayerWorkspace({ campaignId, sessionId, mobileTab }: { campaignId: string; sessionId: string; mobileTab: MobileTab }) {
  const { data: campaign } = useCampaign(campaignId);
  const { viewer } = useViewer(campaignId);
  const { data: characters = [] } = useCharacters(campaignId);
  const [sheetOpen, setSheetOpen] = useState(false);

  const myCharacter = characters.find((c) => c.user_id === viewer?.userId);

  return (
    <>
      <main className={cn('scroll-area min-w-0 flex-1 overflow-y-auto p-3 pb-20 lg:pb-3', mobileTab === 'dice' ? 'hidden lg:block' : '')}>
        <div className="flex flex-col gap-6">
          {mobileTab === 'character' && myCharacter ? null : (
            <>
              <InitiativeTracker sessionId={sessionId} campaignId={campaignId} campaign={campaign} />
              <section>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-fg-muted)]">공개된 자료</h2>
                <RevealedCards campaignId={campaignId} />
              </section>
              <PartyBoard campaignId={campaignId} />
            </>
          )}

          {myCharacter ? (
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">내 캐릭터 — {myCharacter.name}</h2>
                <Button variant="secondary" size="sm" onClick={() => setSheetOpen(true)}>
                  시트 열기
                </Button>
              </div>
            </section>
          ) : (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-fg-muted)]">
              아직 캐릭터가 없습니다. 캠페인 화면에서 캐릭터를 만들어 주세요.
            </p>
          )}
        </div>
      </main>

      <aside
        className={cn(
          'scroll-area w-80 shrink-0 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3',
          'hidden lg:block',
          mobileTab === 'dice' && 'block w-full lg:w-80',
        )}
      >
        <div className="flex flex-col gap-5 pb-20 lg:pb-0">
          <TimerPanel sessionId={sessionId} canManage={false} />
          <DicePanel campaignId={campaignId} sessionId={sessionId} isDM={false} />
        </div>
      </aside>

      {sheetOpen && myCharacter ? (
        <CharacterSheet character={myCharacter} campaignId={campaignId} onClose={() => setSheetOpen(false)} />
      ) : null}
    </>
  );
}

function MobileNav({ active, onChange, isDM: dm }: { active: MobileTab; onChange: (tab: MobileTab) => void; isDM: boolean }) {
  const items: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
    { key: 'session', label: '세션', icon: <Shield aria-hidden className="h-5 w-5" /> },
    { key: 'character', label: dm ? '파티' : '캐릭터', icon: <User aria-hidden className="h-5 w-5" /> },
    { key: 'combat', label: '전투', icon: <Swords aria-hidden className="h-5 w-5" /> },
    ...(dm ? [{ key: 'library' as MobileTab, label: '자료', icon: <BookOpen aria-hidden className="h-5 w-5" /> }] : []),
    { key: 'dice', label: '주사위', icon: <Dices aria-hidden className="h-5 w-5" /> },
  ];

  return (
    <nav
      aria-label="세션 화면 전환"
      className="pb-safe fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--color-border)] bg-[var(--color-surface)] lg:hidden"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-current={active === item.key ? 'page' : undefined}
          onClick={() => onChange(item.key)}
          className={cn(
            'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs',
            active === item.key ? 'text-[var(--color-accent)]' : 'text-[var(--color-fg-muted)]',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export { TimerIcon };
