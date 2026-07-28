import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { repo } from '@/data';
import type { CardFilter } from '@/domain/search';
import type { UUID } from '@/data/types';
import { viewerFromMember } from '@/domain/permissions';

/**
 * TanStack Query 키와 공통 훅.
 * 실시간 이벤트는 여기 정의된 키에 증분 반영한다(전체 재조회 금지).
 */

export const qk = {
  session: ['session'] as const,
  preferences: ['preferences'] as const,
  campaigns: ['campaigns'] as const,
  campaign: (id: UUID) => ['campaign', id] as const,
  members: (id: UUID) => ['members', id] as const,
  membership: (id: UUID) => ['membership', id] as const,
  invites: ['invites'] as const,
  campaignInvites: (id: UUID) => ['campaign-invites', id] as const,
  sessions: (campaignId: UUID) => ['sessions', campaignId] as const,
  gameSession: (id: UUID) => ['game-session', id] as const,
  participants: (id: UUID) => ['participants', id] as const,
  logs: (id: UUID) => ['logs', id] as const,
  folders: (campaignId: UUID) => ['folders', campaignId] as const,
  tags: (campaignId: UUID) => ['tags', campaignId] as const,
  cards: (campaignId: UUID, filter?: CardFilter) => ['cards', campaignId, filter ?? {}] as const,
  visibleCards: (campaignId: UUID) => ['visible-cards', campaignId] as const,
  card: (id: UUID) => ['card', id] as const,
  templates: (campaignId: UUID) => ['templates', campaignId] as const,
  characters: (campaignId: UUID) => ['characters', campaignId] as const,
  character: (id: UUID) => ['character', id] as const,
  resources: (characterId: UUID) => ['resources', characterId] as const,
  encounter: (sessionId: UUID) => ['encounter', sessionId] as const,
  combatants: (encounterId: UUID) => ['combatants', encounterId] as const,
  timers: (sessionId: UUID) => ['timers', sessionId] as const,
  dice: (sessionId: UUID) => ['dice', sessionId] as const,
  notifications: ['notifications'] as const,
  files: (campaignId: UUID) => ['files', campaignId] as const,
  trash: (campaignId: UUID) => ['trash', campaignId] as const,
  audit: (campaignId: UUID) => ['audit', campaignId] as const,
};

type QueryOpts<T> = Omit<UseQueryOptions<T, Error, T>, 'queryKey' | 'queryFn'>;

export function useCampaigns() {
  return useQuery({ queryKey: qk.campaigns, queryFn: () => repo().campaigns.list() });
}

export function useCampaign(id: UUID | undefined) {
  return useQuery({
    queryKey: qk.campaign(id ?? ''),
    queryFn: () => repo().campaigns.get(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useMembership(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.membership(campaignId ?? ''),
    queryFn: () => repo().campaigns.myMembership(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

/** 현재 사용자의 권한 컨텍스트 — 공개 범위 계산에 사용 */
export function useViewer(campaignId: UUID | undefined) {
  const { data, ...rest } = useMembership(campaignId);
  return { viewer: viewerFromMember(data), member: data, ...rest };
}

export function useMembers(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.members(campaignId ?? ''),
    queryFn: () => repo().campaigns.members(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useSessions(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.sessions(campaignId ?? ''),
    queryFn: () => repo().sessions.list(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useGameSession(sessionId: UUID | undefined) {
  return useQuery({
    queryKey: qk.gameSession(sessionId ?? ''),
    queryFn: () => repo().sessions.get(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
}

export function useFolders(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.folders(campaignId ?? ''),
    queryFn: () => repo().library.folders(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useTags(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.tags(campaignId ?? ''),
    queryFn: () => repo().library.tags(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useCards(campaignId: UUID | undefined, filter?: CardFilter, options?: QueryOpts<Awaited<ReturnType<ReturnType<typeof repo>['library']['cards']>>>) {
  return useQuery({
    queryKey: qk.cards(campaignId ?? '', filter),
    queryFn: () => repo().library.cards(campaignId ?? '', filter),
    enabled: Boolean(campaignId),
    ...options,
  });
}

export function useVisibleCards(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.visibleCards(campaignId ?? ''),
    queryFn: () => repo().library.visibleCards(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useCard(cardId: UUID | undefined) {
  return useQuery({
    queryKey: qk.card(cardId ?? ''),
    queryFn: () => repo().library.card(cardId ?? ''),
    enabled: Boolean(cardId),
  });
}

export function useCharacters(campaignId: UUID | undefined) {
  return useQuery({
    queryKey: qk.characters(campaignId ?? ''),
    queryFn: () => repo().characters.list(campaignId ?? ''),
    enabled: Boolean(campaignId),
  });
}

export function useEncounter(sessionId: UUID | undefined) {
  return useQuery({
    queryKey: qk.encounter(sessionId ?? ''),
    queryFn: () => repo().combat.activeEncounter(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
}

export function useCombatants(encounterId: UUID | undefined) {
  return useQuery({
    queryKey: qk.combatants(encounterId ?? ''),
    queryFn: () => repo().combat.combatants(encounterId ?? ''),
    enabled: Boolean(encounterId),
  });
}

export function useTimers(sessionId: UUID | undefined) {
  return useQuery({
    queryKey: qk.timers(sessionId ?? ''),
    queryFn: () => repo().timers.list(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
}

export function useDiceRolls(sessionId: UUID | undefined) {
  return useQuery({
    queryKey: qk.dice(sessionId ?? ''),
    queryFn: () => repo().dice.list(sessionId ?? '', 50),
    enabled: Boolean(sessionId),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: qk.notifications, queryFn: () => repo().notifications.list() });
}

export function useSessionLogs(sessionId: UUID | undefined, filter?: { eventType?: string; query?: string }) {
  return useQuery({
    queryKey: [...qk.logs(sessionId ?? ''), filter ?? {}],
    queryFn: () => repo().sessions.logs(sessionId ?? '', filter),
    enabled: Boolean(sessionId),
  });
}

/** 무효화 도우미 — 실시간 이벤트에서 필요한 최소 범위만 갱신할 때 사용 */
export function useInvalidate() {
  const client = useQueryClient();
  return {
    client,
    cards: (campaignId: UUID) => {
      void client.invalidateQueries({ queryKey: ['cards', campaignId] });
      void client.invalidateQueries({ queryKey: qk.visibleCards(campaignId) });
    },
    combat: (sessionId: UUID, encounterId?: UUID) => {
      void client.invalidateQueries({ queryKey: qk.encounter(sessionId) });
      if (encounterId) void client.invalidateQueries({ queryKey: qk.combatants(encounterId) });
    },
    session: (sessionId: UUID) => {
      void client.invalidateQueries({ queryKey: qk.gameSession(sessionId) });
      void client.invalidateQueries({ queryKey: qk.timers(sessionId) });
      void client.invalidateQueries({ queryKey: qk.dice(sessionId) });
      void client.invalidateQueries({ queryKey: qk.logs(sessionId) });
    },
  };
}

export function useMarkNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: UUID[]) => repo().notifications.markRead(ids),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.notifications }),
  });
}
