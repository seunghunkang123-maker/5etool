import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { repo } from '@/data';
import type { ConnectionStatus, RealtimeEvent } from '@/data/repository';
import type { UUID } from '@/data/types';
import { qk } from './queries';

/**
 * 실시간 동기화.
 *
 * 원칙
 * - 이벤트가 오면 해당 쿼리만 무효화한다(전체 목록 재조회 금지).
 * - 세션을 벗어나면 구독을 정리한다.
 * - 연결이 끊겼다 복구되면 서버 데이터로 다시 맞춘다.
 */

const SESSION_TABLE_KEYS: Record<string, (sessionId: UUID) => readonly unknown[]> = {
  encounters: (id) => qk.encounter(id),
  timers: (id) => qk.timers(id),
  dice_rolls: (id) => qk.dice(id),
  session_logs: (id) => qk.logs(id),
  sessions: (id) => qk.gameSession(id),
  session_participants: (id) => qk.participants(id),
};

export function useSessionRealtime(sessionId: UUID | undefined, campaignId: UUID | undefined, encounterId: UUID | null | undefined): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!sessionId) return;
    const handle = (event: RealtimeEvent) => {
      // '*'는 어떤 변경인지 특정할 수 없을 때의 신호다(데모 어댑터의 폴백).
      if (event.table === '*') {
        void client.invalidateQueries();
        return;
      }
      const keyFactory = SESSION_TABLE_KEYS[event.table];
      if (keyFactory) {
        void client.invalidateQueries({ queryKey: keyFactory(sessionId) });
      }
      if (event.table === 'encounter_combatants' || event.table === 'combatant_conditions') {
        void client.invalidateQueries({ queryKey: qk.encounter(sessionId) });
        if (encounterId) void client.invalidateQueries({ queryKey: qk.combatants(encounterId) });
      }
      if (event.table === 'cards' && campaignId) {
        void client.invalidateQueries({ queryKey: ['cards', campaignId] });
        void client.invalidateQueries({ queryKey: qk.visibleCards(campaignId) });
      }
      if (event.table === 'player_characters' && campaignId) {
        void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
      }
      if (event.table === 'notifications') {
        void client.invalidateQueries({ queryKey: qk.notifications });
      }
    };

    const unsubscribeSession = repo().realtime.subscribeSession(sessionId, handle);
    const unsubscribeCampaign = campaignId ? repo().realtime.subscribeCampaign(campaignId, handle) : undefined;

    return () => {
      unsubscribeSession();
      unsubscribeCampaign?.();
    };
  }, [sessionId, campaignId, encounterId, client]);
}

export function useCampaignRealtime(campaignId: UUID | undefined): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!campaignId) return;
    return repo().realtime.subscribeCampaign(campaignId, (event) => {
      if (event.table === '*') {
        void client.invalidateQueries();
      } else if (event.table === 'cards') {
        void client.invalidateQueries({ queryKey: ['cards', campaignId] });
        void client.invalidateQueries({ queryKey: qk.visibleCards(campaignId) });
      } else if (event.table === 'player_characters') {
        void client.invalidateQueries({ queryKey: qk.characters(campaignId) });
      } else if (event.table === 'campaign_members') {
        void client.invalidateQueries({ queryKey: qk.members(campaignId) });
      } else if (event.table === 'sessions') {
        void client.invalidateQueries({ queryKey: qk.sessions(campaignId) });
      }
    });
  }, [campaignId, client]);
}

export function useUserRealtime(userId: UUID | undefined): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    return repo().realtime.subscribeUser(userId, (event) => {
      if (event.table === 'notifications' || event.table === '*') {
        void client.invalidateQueries({ queryKey: qk.notifications });
      }
    });
  }, [userId, client]);
}

/** 연결 상태 — 상단 바에 표시하고 복구 시 전체 재동기화한다. */
export function useConnectionStatus(): ConnectionStatus {
  const client = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>(() => repo().realtime.status());

  useEffect(() => {
    let wasDisconnected = false;
    return repo().realtime.onStatusChange((next) => {
      setStatus(next);
      if (next === 'disconnected') wasDisconnected = true;
      if (next === 'connected' && wasDisconnected) {
        wasDisconnected = false;
        // 끊긴 동안 놓친 변경을 서버 기준으로 다시 맞춘다.
        void client.invalidateQueries();
      }
    });
  }, [client]);

  useEffect(() => {
    const onOnline = () => void client.invalidateQueries();
    globalThis.addEventListener?.('online', onOnline);
    return () => globalThis.removeEventListener?.('online', onOnline);
  }, [client]);

  return status;
}
