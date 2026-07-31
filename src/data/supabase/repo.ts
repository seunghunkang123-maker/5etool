import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  AppError,
  type CampaignExport,
  type CampaignWithMeta,
  type ConnectionStatus,
  type ImportPreview,
  type RealtimeEvent,
  type RealtimeHandler,
  type Repository,
  type SessionState,
} from '../repository';
import type {
  AppNotification,
  AuditLog,
  Campaign,
  CampaignInvite,
  CampaignMember,
  Card,
  CardSection,
  CardTemplate,
  CharacterResource,
  Combatant,
  CombatantCondition,
  Condition,
  DeletedItem,
  DiceRoll,
  Encounter,
  Folder,
  GameSession,
  MonsterStats,
  PlayerCharacter,
  Profile,
  SessionLog,
  SessionParticipant,
  Tag,
  Timer,
  UploadedFile,
  UserPreferences,
  UUID,
} from '../types';
import { defaultMonsterStats, defaultPreferences, emptySummary, normalizeCharacter, SYSTEM_TEMPLATES } from '../defaults';
import { isMissingColumn, sb, toAppError, unwrap, unwrapVoid } from './client';
import { filterCards, rankCards } from '@/domain/search';
import { projectCardForViewer, type VisibleCard } from '@/domain/reveal';
import { rollExpression } from '@/domain/dice';
import { generatedMonsterSchema } from '@/domain/monsterSchema';
import { CONDITION_MAP } from '@/domain/conditions';
import { combatantNames, nextTurn, previousTurn, turnOrder } from '@/domain/initiative';
import { normalizeCombatantInput } from '@/domain/combatant';
import { applyDamage, applyHealing, setMaxHp, setTempHp } from '@/domain/hp';

/**
 * Supabase 어댑터 (운영 경로).
 *
 * 이 어댑터의 모든 요청은 RLS 정책을 통과해야 한다.
 * 클라이언트 측 권한 판정은 UI 편의를 위한 것이고, 실제 강제는 DB에서 이루어진다.
 */

const CARD_SELECT = '*, card_tags(tag_id), monster_stats(*), card_sections(*)';

type Row = Record<string, unknown>;

interface CardRow extends Row {
  card_tags?: { tag_id: UUID }[];
  monster_stats?: MonsterStats[] | MonsterStats | null;
  card_sections?: CardSection[];
}

function mapCard(row: CardRow): Card {
  const { card_tags: cardTags, monster_stats: stats, card_sections: sections, ...rest } = row;
  const statsRow = Array.isArray(stats) ? (stats[0] ?? null) : (stats ?? null);
  return {
    ...(rest as unknown as Card),
    tag_ids: (cardTags ?? []).map((t) => t.tag_id),
    stats: statsRow,
    sections: [...(sections ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  };
}

/**
 * Edge Function 오류에서 사용자에게 보여줄 한국어 메시지를 꺼낸다.
 * supabase-js는 4xx/5xx 응답을 FunctionsHttpError로 감싸고 본문을 error.context(Response)에 담는다.
 */
async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown })?.context;
  if (!(context instanceof Response)) return fallback;
  try {
    const body = (await context.clone().json()) as { error?: unknown };
    return typeof body.error === 'string' && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 회원가입 실패 원인을 사용자가 조치할 수 있는 한국어 메시지로 바꾼다.
 *
 * 이전에는 모든 실패를 "입력값을 확인해 주세요"로 뭉뚱그렸는데,
 * 실제로는 서버 설정 문제(스키마 미적용, 메일 발송 실패)인 경우가 많아
 * 사용자가 입력만 계속 고치게 만들었다. 원인별로 다음 행동을 알려 준다.
 */
export function signUpError(error: { message?: string; status?: number }): AppError {
  const raw = error.message ?? '';
  const message = raw.toLowerCase();

  if (message.includes('already registered') || message.includes('already been registered')) {
    return new AppError('이미 가입된 이메일입니다. 로그인해 주세요.', 'conflict', error);
  }
  if (message.includes('database error')) {
    // handle_new_user 트리거가 실패하는 경우. 대개 마이그레이션이 끝까지 적용되지 않았다.
    return new AppError(
      '서버 데이터베이스가 준비되지 않아 가입에 실패했습니다. 관리자에게 문의해 주세요. (마이그레이션 적용 필요)',
      'server',
      error,
    );
  }
  if (message.includes('password')) {
    return new AppError('비밀번호가 서버 정책에 맞지 않습니다. 더 길고 복잡한 비밀번호를 사용해 주세요.', 'validation', error);
  }
  if (message.includes('email') && (message.includes('invalid') || message.includes('valid'))) {
    return new AppError('이메일 주소를 다시 확인해 주세요.', 'validation', error);
  }
  if (message.includes('sending') || message.includes('smtp') || message.includes('confirmation email')) {
    return new AppError(
      '계정은 만들어졌지만 인증 메일을 보내지 못했습니다. 잠시 후 로그인하거나 관리자에게 문의해 주세요.',
      'server',
      error,
    );
  }
  if (message.includes('rate limit') || error.status === 429) {
    return new AppError('가입 시도가 너무 잦습니다. 잠시 후 다시 시도해 주세요.', 'rate_limit', error);
  }
  if (message.includes('signups not allowed') || message.includes('disabled')) {
    return new AppError('현재 신규 가입이 중단되어 있습니다. 관리자에게 문의해 주세요.', 'forbidden', error);
  }
  // 알 수 없는 원인은 감추지 말고 원문을 함께 보여 준다. 그래야 조치할 수 있다.
  return new AppError(
    raw ? `회원가입에 실패했습니다. (${raw})` : '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.',
    'unknown',
    error,
  );
}

async function currentUserId(): Promise<UUID> {
  const { data } = await sb().auth.getUser();
  if (!data.user) throw new AppError('로그인이 필요합니다.', 'unauthorized');
  return data.user.id;
}

// ── 프로필 이미지 ────────────────────────────────────────────────────
// Storage 정책(0004_storage.sql)과 같은 제한을 클라이언트에서도 확인한다.
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/**
 * 공개 URL에서 Storage 경로를 되돌린다. 이전 이미지를 지우는 데만 쓴다.
 * 자기 폴더(`{userId}/`)로 시작하지 않으면 무시한다 — 남의 파일을 지우지 않기 위한 방어다.
 */
function avatarPathFromUrl(url: string | null, userId: UUID): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/avatars/';
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = decodeURIComponent(url.slice(index + marker.length).split('?')[0] ?? '');
  return path.startsWith(`${userId}/`) ? path : null;
}

async function campaignIdOfSession(sessionId: UUID): Promise<UUID> {
  const row = unwrap(
    await sb().from('sessions').select('campaign_id').eq('id', sessionId).single(),
    '세션을 찾을 수 없습니다.',
  ) as { campaign_id: UUID };
  return row.campaign_id;
}

export function createSupabaseRepository(): Repository {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();
  let connectionStatus: ConnectionStatus = 'connecting';

  function setStatus(status: ConnectionStatus): void {
    if (connectionStatus === status) return;
    connectionStatus = status;
    for (const listener of statusListeners) listener(status);
  }

  /** 테이블 변경을 하나의 채널로 묶어 구독한다. */
  function subscribe(name: string, tables: { table: string; filter?: string }[], handler: RealtimeHandler): () => void {
    let channel: RealtimeChannel = sb().channel(name);
    for (const { table, filter } of tables) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        (payload) => {
          const event: RealtimeEvent = {
            table,
            eventType: payload.eventType as RealtimeEvent['eventType'],
            new: (payload.new as Row) ?? null,
            old: (payload.old as Row) ?? null,
          };
          handler(event);
        },
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') setStatus('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setStatus('disconnected');
      else setStatus('connecting');
    });
    return () => {
      void sb().removeChannel(channel);
    };
  }

  async function loadProfile(userId: UUID): Promise<Profile | null> {
    const { data, error } = await sb().from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) throw toAppError(error, '프로필을 불러오지 못했습니다.');
    return (data as Profile) ?? null;
  }

  async function buildSessionState(): Promise<SessionState> {
    const { data } = await sb().auth.getUser();
    if (!data.user) return { user: null, profile: null };
    const profile = await loadProfile(data.user.id);
    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        email_confirmed: Boolean(data.user.email_confirmed_at),
      },
      profile,
    };
  }

  return {
    mode: 'supabase',

    auth: {
      async getSession() {
        return buildSessionState();
      },
      onChange(cb) {
        const { data } = sb().auth.onAuthStateChange(() => {
          void buildSessionState().then(cb);
        });
        return () => data.subscription.unsubscribe();
      },
      async signUp(email, password, displayName) {
        const { error } = await sb().auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: `${globalThis.location?.origin ?? ''}/auth/callback`,
          },
        });
        if (error) throw signUpError(error);
        return buildSessionState();
      },
      async signIn(email, password) {
        const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 'unauthorized', error);
        return buildSessionState();
      },
      async signOut() {
        await sb().auth.signOut();
      },
      async signOutEverywhere() {
        const { error } = await sb().auth.signOut({ scope: 'global' });
        if (error) throw new AppError('모든 기기에서 로그아웃하지 못했습니다.', 'unknown', error);
      },
      async requestPasswordReset(email) {
        const { error } = await sb().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${globalThis.location?.origin ?? ''}/reset-password`,
        });
        if (error) throw new AppError('비밀번호 재설정 메일을 보내지 못했습니다.', 'unknown', error);
      },
      async updatePassword(newPassword) {
        const { error } = await sb().auth.updateUser({ password: newPassword });
        if (error) throw new AppError('비밀번호를 변경하지 못했습니다.', 'validation', error);
      },
      async resendVerification() {
        const { data } = await sb().auth.getUser();
        if (!data.user?.email) throw new AppError('로그인이 필요합니다.', 'unauthorized');
        const { error } = await sb().auth.resend({ type: 'signup', email: data.user.email });
        if (error) throw new AppError('인증 메일을 다시 보내지 못했습니다.', 'unknown', error);
      },
      async updateProfile(patch) {
        const userId = await currentUserId();
        const data = unwrap(
          await sb().from('profiles').update(patch).eq('id', userId).select().single(),
          '프로필을 저장하지 못했습니다.',
        );
        return data as Profile;
      },
      async uploadAvatar(file) {
        const userId = await currentUserId();

        // 확장자만 믿지 않는다. 서버 정책(Storage)도 같은 제한을 다시 검사한다.
        if (!AVATAR_TYPES.includes(file.type)) {
          throw new AppError('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.', 'validation');
        }
        if (file.size > MAX_AVATAR_BYTES) {
          throw new AppError('프로필 이미지는 2MB를 넘을 수 없습니다.', 'validation');
        }

        // 저장 이름을 무작위로 정한다. 원본 파일 이름은 저장하지 않는다.
        const extension = AVATAR_EXTENSIONS[file.type] ?? 'png';
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await sb()
          .storage.from('avatars')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw toAppError(uploadError, '프로필 이미지를 올리지 못했습니다.');

        const { data: urlData } = sb().storage.from('avatars').getPublicUrl(path);

        const previous = (await loadProfile(userId))?.avatar_url ?? null;
        const profile = unwrap(
          await sb().from('profiles').update({ avatar_url: urlData.publicUrl }).eq('id', userId).select().single(),
          '프로필을 저장하지 못했습니다.',
        ) as Profile;

        // 이전 이미지는 정리한다. 실패해도 프로필 변경은 유효하다.
        const stale = avatarPathFromUrl(previous, userId);
        if (stale && stale !== path) {
          await sb().storage.from('avatars').remove([stale]).catch(() => undefined);
        }
        return profile;
      },
      async removeAvatar() {
        const userId = await currentUserId();
        const previous = (await loadProfile(userId))?.avatar_url ?? null;
        const profile = unwrap(
          await sb().from('profiles').update({ avatar_url: null }).eq('id', userId).select().single(),
          '프로필을 저장하지 못했습니다.',
        ) as Profile;

        const stale = avatarPathFromUrl(previous, userId);
        if (stale) await sb().storage.from('avatars').remove([stale]).catch(() => undefined);
        return profile;
      },
      async deleteAccount() {
        // 계정 삭제는 service_role 권한이 필요하므로 Edge Function으로 위임한다.
        const { error } = await sb().functions.invoke('delete-account', { body: {} });
        if (error) {
          const message = await edgeErrorMessage(error, '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
          throw new AppError(message, 'unknown', error);
        }
        await sb().auth.signOut();
      },
      async getPreferences() {
        const userId = await currentUserId();
        const { data, error } = await sb().from('user_preferences').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw toAppError(error, '설정을 불러오지 못했습니다.');
        if (data) return data as UserPreferences;
        const created = defaultPreferences(userId);
        await sb().from('user_preferences').insert(created);
        return created;
      },
      async savePreferences(patch) {
        const userId = await currentUserId();
        const data = unwrap(
          await sb()
            .from('user_preferences')
            .upsert({ ...patch, user_id: userId }, { onConflict: 'user_id' })
            .select()
            .single(),
          '설정을 저장하지 못했습니다.',
        );
        return data as UserPreferences;
      },
    },

    campaigns: {
      async list() {
        const data = unwrap(
          await sb().from('campaign_overview').select('*').order('updated_at', { ascending: false }),
          '캠페인 목록을 불러오지 못했습니다.',
        );
        return data as CampaignWithMeta[];
      },
      async get(id) {
        return unwrap(
          await sb().from('campaigns').select('*').eq('id', id).is('deleted_at', null).single(),
          '캠페인을 찾을 수 없습니다.',
        ) as Campaign;
      },
      async create(input) {
        const userId = await currentUserId();
        const campaign = unwrap(
          await sb()
            .from('campaigns')
            .insert({ ...input, owner_id: userId })
            .select()
            .single(),
          '캠페인을 만들지 못했습니다.',
        ) as Campaign;
        return campaign;
      },
      async update(id, patch) {
        return unwrap(
          await sb().from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select().single(),
          '캠페인을 저장하지 못했습니다.',
        ) as Campaign;
      },
      async softDelete(id) {
        unwrapVoid(
          await sb().from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id),
          '캠페인을 삭제하지 못했습니다.',
        );
      },
      async restore(id) {
        unwrapVoid(await sb().from('campaigns').update({ deleted_at: null }).eq('id', id), '캠페인을 복구하지 못했습니다.');
      },
      async duplicate(id, name) {
        const data = unwrap(
          await sb().rpc('duplicate_campaign', { p_campaign_id: id, p_name: name }),
          '캠페인을 복제하지 못했습니다.',
        ) as Campaign[] | Campaign;
        return Array.isArray(data) ? (data[0] as Campaign) : data;
      },
      async regenerateJoinCode(id) {
        const data = unwrap(await sb().rpc('regenerate_join_code', { p_campaign_id: id }), '참여 코드를 변경하지 못했습니다.');
        return String(data);
      },
      async joinByCode(code) {
        const data = unwrap(
          await sb().rpc('join_campaign_by_code', { p_code: code.trim().toUpperCase() }),
          '참여 코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.',
        ) as Campaign[] | Campaign;
        return Array.isArray(data) ? (data[0] as Campaign) : data;
      },
      async members(id) {
        const data = unwrap(
          await sb()
            .from('campaign_members')
            .select('*, profile:profiles(id, display_name, avatar_url, email)')
            .eq('campaign_id', id),
          '구성원을 불러오지 못했습니다.',
        );
        return data as CampaignMember[];
      },
      async myMembership(id) {
        const userId = await currentUserId();
        const { data, error } = await sb()
          .from('campaign_members')
          .select('*')
          .eq('campaign_id', id)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw toAppError(error, '권한 정보를 불러오지 못했습니다.');
        return (data as CampaignMember) ?? null;
      },
      async updateMember(campaignId, userId, patch) {
        return unwrap(
          await sb()
            .from('campaign_members')
            .update(patch)
            .eq('campaign_id', campaignId)
            .eq('user_id', userId)
            .select()
            .single(),
          '권한을 변경하지 못했습니다.',
        ) as CampaignMember;
      },
      async removeMember(campaignId, userId) {
        unwrapVoid(
          await sb().from('campaign_members').delete().eq('campaign_id', campaignId).eq('user_id', userId),
          '구성원을 내보내지 못했습니다.',
        );
      },
      async invite(campaignId, email, role) {
        return unwrap(
          await sb()
            .from('campaign_invites')
            .insert({ campaign_id: campaignId, email: email.trim().toLowerCase(), role })
            .select()
            .single(),
          '초대를 보내지 못했습니다.',
        ) as CampaignInvite;
      },
      async listInvites(campaignId) {
        return unwrap(
          await sb().from('campaign_invites').select('*').eq('campaign_id', campaignId),
          '초대 목록을 불러오지 못했습니다.',
        ) as CampaignInvite[];
      },
      async myInvites() {
        return unwrap(
          await sb().from('my_invites').select('*'),
          '초대를 불러오지 못했습니다.',
        ) as CampaignInvite[];
      },
      async respondToInvite(inviteId, accept) {
        unwrapVoid(
          await sb().rpc('respond_to_invite', { p_invite_id: inviteId, p_accept: accept }),
          '초대에 응답하지 못했습니다.',
        );
      },
      async exportData(campaignId) {
        const [campaign, folders, tags, cards, characters, sessions] = await Promise.all([
          sb().from('campaigns').select('*').eq('id', campaignId).single(),
          sb().from('folders').select('*').eq('campaign_id', campaignId).is('deleted_at', null),
          sb().from('tags').select('*').eq('campaign_id', campaignId),
          sb().from('cards').select(CARD_SELECT).eq('campaign_id', campaignId).is('deleted_at', null),
          sb().from('player_characters').select('*').eq('campaign_id', campaignId),
          sb().from('sessions').select('*').eq('campaign_id', campaignId).is('deleted_at', null),
        ]);
        return {
          version: 1,
          exported_at: new Date().toISOString(),
          campaign: unwrap(campaign, '캠페인을 불러오지 못했습니다.') as Campaign,
          folders: (unwrap(folders, '폴더를 불러오지 못했습니다.') as Folder[]) ?? [],
          tags: (unwrap(tags, '태그를 불러오지 못했습니다.') as Tag[]) ?? [],
          cards: ((unwrap(cards, '카드를 불러오지 못했습니다.') as CardRow[]) ?? []).map(mapCard),
          characters: (unwrap(characters, '캐릭터를 불러오지 못했습니다.') as PlayerCharacter[]) ?? [],
          sessions: (unwrap(sessions, '세션을 불러오지 못했습니다.') as GameSession[]) ?? [],
        } satisfies CampaignExport;
      },
      async previewImport(raw) {
        const parsed = raw as Partial<CampaignExport>;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) {
          throw new AppError('가져올 수 없는 파일 형식입니다. 앱에서 내보낸 JSON인지 확인해 주세요.', 'validation');
        }
        return {
          campaignName: parsed.campaign?.name ?? '이름 없는 캠페인',
          folders: parsed.folders?.length ?? 0,
          tags: parsed.tags?.length ?? 0,
          cards: parsed.cards.length,
          conflicts: [],
        } satisfies ImportPreview;
      },
      async importData(campaignId, raw, strategy) {
        const data = unwrap(
          await sb().rpc('import_campaign_data', {
            p_campaign_id: campaignId,
            p_payload: raw as Row,
            p_strategy: strategy,
          }),
          '데이터를 가져오지 못했습니다.',
        ) as Campaign[] | Campaign;
        return Array.isArray(data) ? (data[0] as Campaign) : data;
      },
      async trash(campaignId) {
        return unwrap(
          await sb().from('deleted_items').select('*').eq('campaign_id', campaignId).order('deleted_at', { ascending: false }),
          '휴지통을 불러오지 못했습니다.',
        ) as DeletedItem[];
      },
      async restoreItem(itemId) {
        unwrapVoid(await sb().rpc('restore_deleted_item', { p_item_id: itemId }), '항목을 복구하지 못했습니다.');
      },
      async purgeItem(itemId) {
        unwrapVoid(await sb().from('deleted_items').delete().eq('id', itemId), '항목을 영구 삭제하지 못했습니다.');
      },
      async auditLogs(campaignId) {
        return unwrap(
          await sb().from('audit_logs').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(200),
          '감사 로그를 불러오지 못했습니다.',
        ) as AuditLog[];
      },
    },

    sessions: {
      async list(campaignId) {
        return unwrap(
          await sb().from('sessions').select('*').eq('campaign_id', campaignId).is('deleted_at', null).order('session_number', { ascending: false }),
          '세션 목록을 불러오지 못했습니다.',
        ) as GameSession[];
      },
      async get(id) {
        return unwrap(await sb().from('sessions').select('*').eq('id', id).single(), '세션을 찾을 수 없습니다.') as GameSession;
      },
      async create(campaignId, input) {
        const { count } = await sb()
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId);
        return unwrap(
          await sb()
            .from('sessions')
            .insert({
              campaign_id: campaignId,
              title: input.title?.trim() || `${(count ?? 0) + 1}번째 세션`,
              session_number: input.session_number ?? (count ?? 0) + 1,
              scheduled_at: input.scheduled_at ?? null,
              description: input.description ?? '',
              status: input.status ?? 'scheduled',
            })
            .select()
            .single(),
          '세션을 만들지 못했습니다.',
        ) as GameSession;
      },
      async update(id, patch) {
        return unwrap(await sb().from('sessions').update(patch).eq('id', id).select().single(), '세션을 저장하지 못했습니다.') as GameSession;
      },
      async start(id) {
        return unwrap(await sb().rpc('start_session', { p_session_id: id }).select().single(), '세션을 시작하지 못했습니다.') as GameSession;
      },
      async end(id) {
        return unwrap(await sb().rpc('end_session', { p_session_id: id }).select().single(), '세션을 종료하지 못했습니다.') as GameSession;
      },
      async remove(id) {
        // 소유자만 지울 수 있고, 휴지통에 남긴다. 권한 판정은 서버 함수가 한다.
        const { error } = await sb().rpc('soft_delete_session', { p_session_id: id });
        if (error) throw toAppError(error, '세션을 삭제하지 못했습니다.');
      },
      async participants(id) {
        return unwrap(
          await sb().from('session_participant_view').select('*').eq('session_id', id),
          '참가자를 불러오지 못했습니다.',
        ) as SessionParticipant[];
      },
      async join(id) {
        const userId = await currentUserId();
        unwrapVoid(
          await sb()
            .from('session_participants')
            .upsert({ session_id: id, user_id: userId, is_online: true }, { onConflict: 'session_id,user_id' }),
          '세션에 입장하지 못했습니다.',
        );
      },
      async logs(id, filter) {
        let query = sb().from('session_logs').select('*').eq('session_id', id).order('created_at', { ascending: false }).limit(500);
        if (filter?.eventType) query = query.like('event_type', `${filter.eventType}%`);
        if (filter?.query) query = query.ilike('message', `%${filter.query}%`);
        return unwrap(await query, '세션 로그를 불러오지 못했습니다.') as SessionLog[];
      },
      async appendLog(id, log) {
        const userId = await currentUserId();
        const campaignId = await campaignIdOfSession(id);
        return unwrap(
          await sb()
            .from('session_logs')
            .insert({ ...log, session_id: id, campaign_id: campaignId, actor_id: userId })
            .select()
            .single(),
          '로그를 기록하지 못했습니다.',
        ) as SessionLog;
      },
      async undoLog(logId) {
        unwrapVoid(await sb().rpc('undo_session_log', { p_log_id: logId }), '변경을 취소하지 못했습니다.');
      },
      async saveSummary(id, summary) {
        return unwrap(
          await sb().from('sessions').update({ summary }).eq('id', id).select().single(),
          '요약을 저장하지 못했습니다.',
        ) as GameSession;
      },
      async generateSummaryDraft(id) {
        const logs = unwrap(
          await sb().from('session_logs').select('*').eq('session_id', id).order('created_at'),
          '로그를 불러오지 못했습니다.',
        ) as SessionLog[];
        return {
          ...emptySummary(),
          highlights: logs.filter((l) => l.visibility === 'all').slice(-12).map((l) => `- ${l.message}`).join('\n'),
          npcs: [...new Set(logs.filter((l) => l.event_type === 'card.reveal').map((l) => l.target_name))].join(', '),
          combat_result: `진행된 전투 ${logs.filter((l) => l.event_type === 'encounter.start').length}회`,
        };
      },
    },

    library: {
      async folders(campaignId) {
        return unwrap(
          await sb().from('folders').select('*').eq('campaign_id', campaignId).is('deleted_at', null).order('sort_order'),
          '폴더를 불러오지 못했습니다.',
        ) as Folder[];
      },
      async createFolder(campaignId, input) {
        return unwrap(
          await sb()
            .from('folders')
            .insert({ campaign_id: campaignId, name: input.name ?? '새 폴더', parent_id: input.parent_id ?? null, color: input.color ?? null, icon: input.icon ?? null, sort_order: input.sort_order ?? 0 })
            .select()
            .single(),
          '폴더를 만들지 못했습니다.',
        ) as Folder;
      },
      async updateFolder(id, patch) {
        return unwrap(await sb().from('folders').update(patch).eq('id', id).select().single(), '폴더를 저장하지 못했습니다.') as Folder;
      },
      async deleteFolder(id, mode) {
        unwrapVoid(await sb().rpc('delete_folder', { p_folder_id: id, p_mode: mode }), '폴더를 삭제하지 못했습니다.');
      },
      async tags(campaignId) {
        return unwrap(await sb().from('tags').select('*').eq('campaign_id', campaignId).order('name'), '태그를 불러오지 못했습니다.') as Tag[];
      },
      async createTag(campaignId, name, color) {
        return unwrap(
          await sb().from('tags').upsert({ campaign_id: campaignId, name: name.trim(), color }, { onConflict: 'campaign_id,name' }).select().single(),
          '태그를 만들지 못했습니다.',
        ) as Tag;
      },
      async updateTag(id, patch) {
        return unwrap(await sb().from('tags').update(patch).eq('id', id).select().single(), '태그를 저장하지 못했습니다.') as Tag;
      },
      async deleteTag(id) {
        unwrapVoid(await sb().from('tags').delete().eq('id', id), '태그를 삭제하지 못했습니다.');
      },
      async cards(campaignId, filter) {
        let query = sb().from('cards').select(CARD_SELECT).eq('campaign_id', campaignId).is('deleted_at', null);
        if (!filter?.includeArchived) query = query.eq('is_archived', false);
        if (filter?.types?.length) query = query.in('type', filter.types);
        if (filter?.folderId !== undefined && !filter.includeDescendants) {
          query = filter.folderId === null ? query.is('folder_id', null) : query.eq('folder_id', filter.folderId);
        }
        if (filter?.favoritesOnly) query = query.eq('is_favorite', true);
        if (filter?.createdBy) query = query.eq('created_by', filter.createdBy);
        if (filter?.revealScopes?.length) query = query.in('reveal_scope', filter.revealScopes);
        if (filter?.updatedAfter) query = query.gte('updated_at', filter.updatedAfter);
        if (filter?.query) {
          // 전문 검색 인덱스(search_tsv) 사용. 실패해도 클라이언트 필터가 한 번 더 거른다.
          query = query.textSearch('search_tsv', filter.query.split(/\s+/).filter(Boolean).join(' & '), {
            type: 'plain',
            config: 'simple',
          });
        }
        const rows = (unwrap(await query.order('sort_order').limit(2000), '카드를 불러오지 못했습니다.') as CardRow[]) ?? [];
        const cards = rows.map(mapCard);
        const folders = filter?.includeDescendants
          ? ((unwrap(await sb().from('folders').select('id, parent_id').eq('campaign_id', campaignId), '폴더를 불러오지 못했습니다.') as { id: UUID; parent_id: UUID | null }[]) ?? [])
          : [];
        const filtered = filterCards(cards, { includeDmNotes: true, ...filter }, folders);
        return filter?.query ? rankCards(filtered, filter.query) : filtered;
      },
      async visibleCards(campaignId) {
        // player_visible_cards 뷰는 RLS와 동일한 규칙으로 서버에서 필드를 마스킹한다.
        const rows = (unwrap(
          await sb().from('player_visible_cards').select('*').eq('campaign_id', campaignId),
          '공개된 자료를 불러오지 못했습니다.',
        ) as Row[]) ?? [];
        return rows.map((row) => ({
          id: String(row.id),
          type: row.type as VisibleCard['type'],
          name: (row.name as string) ?? null,
          summary: (row.summary as string) ?? null,
          body: (row.body as VisibleCard['body']) ?? null,
          image_url: (row.image_url as string) ?? null,
          stats: (row.stats as VisibleCard['stats']) ?? null,
          sections: (row.sections as VisibleCard['sections']) ?? null,
          hp_tier: (row.hp_tier as VisibleCard['hp_tier']) ?? null,
          reveal_scope: row.reveal_scope as VisibleCard['reveal_scope'],
        }));
      },
      async card(id) {
        const row = unwrap(await sb().from('cards').select(CARD_SELECT).eq('id', id).single(), '카드를 찾을 수 없습니다.') as CardRow;
        return mapCard(row);
      },
      async createCard(campaignId, input) {
        const userId = await currentUserId();
        const card = unwrap(
          await sb()
            .from('cards')
            .insert({
              campaign_id: campaignId,
              folder_id: input.folder_id ?? null,
              type: input.type,
              name: input.name.trim() || '이름 없는 카드',
              summary: input.summary ?? '',
              body: input.body ?? null,
              image_url: input.image_url ?? null,
              dm_notes: input.dm_notes ?? '',
              created_by: userId,
            })
            .select()
            .single(),
          '카드를 만들지 못했습니다.',
        ) as Card;

        if (input.tag_ids?.length) {
          unwrapVoid(
            await sb().from('card_tags').insert(input.tag_ids.map((tagId) => ({ card_id: card.id, tag_id: tagId }))),
            '태그를 연결하지 못했습니다.',
          );
        }
        if (input.stats || input.type === 'monster' || input.type === 'npc') {
          unwrapVoid(
            await sb().from('monster_stats').insert({ ...defaultMonsterStats(card.id), ...(input.stats ?? {}), card_id: card.id }),
            '몬스터 정보를 저장하지 못했습니다.',
          );
        }
        if (input.sections?.length) {
          unwrapVoid(
            await sb().from('card_sections').insert(input.sections.map((s, i) => ({ ...s, card_id: card.id, sort_order: i }))),
            '행동 정보를 저장하지 못했습니다.',
          );
        }
        return this.card(card.id);
      },
      async updateCard(id, patch, expectedVersion) {
        const { tag_ids: tagIds, stats, sections, ...rest } = patch;
        let query = sb()
          .from('cards')
          .update({ ...rest, updated_at: new Date().toISOString(), version: (expectedVersion ?? 0) + 1 })
          .eq('id', id);
        if (expectedVersion !== undefined) query = query.eq('version', expectedVersion);

        const { data, error } = await query.select().maybeSingle();
        if (error) throw toAppError(error, '카드를 저장하지 못했습니다.');
        if (!data) {
          throw new AppError('다른 사용자가 먼저 내용을 수정했습니다. 변경 사항을 비교해 주세요.', 'conflict');
        }
        if (tagIds) {
          await sb().from('card_tags').delete().eq('card_id', id);
          if (tagIds.length > 0) {
            await sb().from('card_tags').insert(tagIds.map((tagId) => ({ card_id: id, tag_id: tagId })));
          }
        }
        if (stats) await this.setStats(id, stats as Omit<MonsterStats, 'card_id'>);
        if (sections) await this.setSections(id, sections);
        return this.card(id);
      },
      async duplicateCard(id) {
        const data = unwrap(await sb().rpc('duplicate_card', { p_card_id: id }), '카드를 복제하지 못했습니다.') as UUID | UUID[];
        const newId = Array.isArray(data) ? String(data[0]) : String(data);
        return this.card(newId);
      },
      async deleteCard(id) {
        unwrapVoid(await sb().rpc('soft_delete_card', { p_card_id: id }), '카드를 삭제하지 못했습니다.');
      },
      async restoreCard(id) {
        unwrapVoid(await sb().from('cards').update({ deleted_at: null }).eq('id', id), '카드를 복구하지 못했습니다.');
      },
      async setReveal(id, input) {
        unwrapVoid(
          await sb().rpc('set_card_reveal', {
            p_card_id: id,
            p_scope: input.scope,
            p_fields: input.fields ?? null,
            p_targets: input.targets ?? [],
            p_temporary: input.temporary ?? false,
            p_session_id: input.sessionId ?? null,
          }),
          '공개 범위를 변경하지 못했습니다.',
        );
        return this.card(id);
      },
      async bulkUpdate(ids, patch) {
        if (ids.length === 0) return;
        const update: Row = { updated_at: new Date().toISOString() };
        if (patch.folder_id !== undefined) update.folder_id = patch.folder_id;
        if (patch.reveal_scope !== undefined) update.reveal_scope = patch.reveal_scope;
        if (patch.is_archived !== undefined) update.is_archived = patch.is_archived;
        if (Object.keys(update).length > 1) {
          unwrapVoid(await sb().from('cards').update(update).in('id', ids), '자료를 수정하지 못했습니다.');
        }
        if (patch.add_tags?.length) {
          const rows = ids.flatMap((cardId) => (patch.add_tags ?? []).map((tagId) => ({ card_id: cardId, tag_id: tagId })));
          await sb().from('card_tags').upsert(rows, { onConflict: 'card_id,tag_id' });
        }
        if (patch.remove_tags?.length) {
          await sb().from('card_tags').delete().in('card_id', ids).in('tag_id', patch.remove_tags);
        }
      },
      async setSections(cardId, sections) {
        await sb().from('card_sections').delete().eq('card_id', cardId);
        if (sections.length === 0) return [];
        return unwrap(
          await sb()
            .from('card_sections')
            .insert(sections.map((s, i) => ({ ...s, card_id: cardId, sort_order: i })))
            .select(),
          '행동 정보를 저장하지 못했습니다.',
        ) as CardSection[];
      },
      async setStats(cardId, stats) {
        return unwrap(
          await sb().from('monster_stats').upsert({ ...stats, card_id: cardId }, { onConflict: 'card_id' }).select().single(),
          '몬스터 정보를 저장하지 못했습니다.',
        ) as MonsterStats;
      },
      async templates(campaignId) {
        const custom = (unwrap(
          await sb().from('card_templates').select('*').eq('campaign_id', campaignId),
          '템플릿을 불러오지 못했습니다.',
        ) as CardTemplate[]) ?? [];
        return [...SYSTEM_TEMPLATES.map((t) => ({ ...t, campaign_id: null })), ...custom];
      },
      async saveTemplate(campaignId, template) {
        return unwrap(
          await sb().from('card_templates').insert({ ...template, campaign_id: campaignId, is_system: false }).select().single(),
          '템플릿을 저장하지 못했습니다.',
        ) as CardTemplate;
      },
      async deleteTemplate(id) {
        unwrapVoid(await sb().from('card_templates').delete().eq('id', id), '템플릿을 삭제하지 못했습니다.');
      },
    },

    characters: {
      async list(campaignId) {
        const rows = unwrap(
          await sb().from('player_characters').select('*').eq('campaign_id', campaignId).order('created_at'),
          '캐릭터를 불러오지 못했습니다.',
        ) as PlayerCharacter[];
        // sheet 기본값이 '{}'이라 항목이 비어 있을 수 있다. 화면에 넘기기 전에 보정한다.
        return rows.map(normalizeCharacter);
      },
      async get(id) {
        return normalizeCharacter(
          unwrap(await sb().from('player_characters').select('*').eq('id', id).single(), '캐릭터를 찾을 수 없습니다.') as PlayerCharacter,
        );
      },
      async create(campaignId, input) {
        const userId = await currentUserId();
        return normalizeCharacter(
          unwrap(
            await sb()
              .from('player_characters')
              .insert({ ...input, campaign_id: campaignId, user_id: input.user_id ?? userId })
              .select()
              .single(),
            '캐릭터를 만들지 못했습니다.',
          ) as PlayerCharacter,
        );
      },
      async update(id, patch, expectedVersion) {
        let query = sb()
          .from('player_characters')
          .update({ ...patch, updated_at: new Date().toISOString(), version: (expectedVersion ?? 0) + 1 })
          .eq('id', id);
        if (expectedVersion !== undefined) query = query.eq('version', expectedVersion);
        const { data, error } = await query.select().maybeSingle();
        if (error) throw toAppError(error, '캐릭터를 저장하지 못했습니다.');
        if (!data) throw new AppError('다른 사용자가 먼저 내용을 수정했습니다. 변경 사항을 비교해 주세요.', 'conflict');
        return normalizeCharacter(data as PlayerCharacter);
      },
      async remove(id) {
        unwrapVoid(await sb().from('player_characters').delete().eq('id', id), '캐릭터를 삭제하지 못했습니다.');
      },
      async resources(characterId) {
        return unwrap(
          await sb().from('character_resources').select('*').eq('character_id', characterId).order('sort_order'),
          '자원을 불러오지 못했습니다.',
        ) as CharacterResource[];
      },
      async saveResource(characterId, resource) {
        return unwrap(
          await sb()
            .from('character_resources')
            .upsert({ ...resource, character_id: characterId })
            .select()
            .single(),
          '자원을 저장하지 못했습니다.',
        ) as CharacterResource;
      },
      async deleteResource(id) {
        unwrapVoid(await sb().from('character_resources').delete().eq('id', id), '자원을 삭제하지 못했습니다.');
      },
      async rest(characterId, kind) {
        unwrapVoid(await sb().rpc('apply_rest', { p_character_id: characterId, p_kind: kind }), '휴식을 적용하지 못했습니다.');
      },
    },

    combat: {
      async encounters(sessionId) {
        return unwrap(
          await sb().from('encounters').select('*').eq('session_id', sessionId).order('created_at'),
          '전투를 불러오지 못했습니다.',
        ) as Encounter[];
      },
      async activeEncounter(sessionId) {
        const { data, error } = await sb()
          .from('encounters')
          .select('*')
          .eq('session_id', sessionId)
          .neq('status', 'ended')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw toAppError(error, '전투를 불러오지 못했습니다.');
        return (data as Encounter) ?? null;
      },
      async createEncounter(sessionId, name) {
        const campaignId = await campaignIdOfSession(sessionId);
        return unwrap(
          await sb().from('encounters').insert({ session_id: sessionId, campaign_id: campaignId, name: name.trim() || '새 전투' }).select().single(),
          '전투를 만들지 못했습니다.',
        ) as Encounter;
      },
      async updateEncounter(id, patch) {
        return unwrap(await sb().from('encounters').update(patch).eq('id', id).select().single(), '전투를 저장하지 못했습니다.') as Encounter;
      },
      async endEncounter(id) {
        return unwrap(
          await sb().from('encounters').update({ status: 'ended', active_combatant_id: null }).eq('id', id).select().single(),
          '전투를 종료하지 못했습니다.',
        ) as Encounter;
      },
      async combatants(encounterId) {
        // 상태 효과를 PostgREST 임베드(`conditions:combatant_conditions(*)`)로 가져오면 안 된다.
        // combatant_conditions에는 encounter_combatants를 가리키는 외래 키가 둘(combatant_id,
        // source_combatant_id) 있어서 PostgREST가 어느 쪽인지 정하지 못하고 요청 전체가 실패한다.
        // 두 번 나눠 조회해 직접 이어 붙인다.
        const rows =
          (unwrap(
            await sb().from('encounter_combatants').select('*').eq('encounter_id', encounterId).order('sort_order'),
            '전투 참가자를 불러오지 못했습니다.',
          ) as Combatant[]) ?? [];
        if (rows.length === 0) return [];

        const conditions =
          (unwrap(
            await sb()
              .from('combatant_conditions')
              .select('*')
              .in('combatant_id', rows.map((row) => row.id))
              .order('created_at'),
            '상태 효과를 불러오지 못했습니다.',
          ) as CombatantCondition[]) ?? [];

        const byCombatant = new Map<UUID, CombatantCondition[]>();
        for (const condition of conditions) {
          const list = byCombatant.get(condition.combatant_id);
          if (list) list.push(condition);
          else byCombatant.set(condition.combatant_id, [condition]);
        }
        return rows.map((row) => ({ ...row, conditions: byCombatant.get(row.id) ?? [] }));
      },
      async addCombatant(encounterId, input) {
        if (!encounterId) throw new AppError('먼저 전투를 만들어 주세요.', 'validation');

        const base = normalizeCombatantInput(input);
        const existing = (unwrap(
          await sb().from('encounter_combatants').select('name').eq('encounter_id', encounterId),
          '참가자를 불러오지 못했습니다.',
        ) as { name: string }[]) ?? [];
        const existingNames = existing.map((e) => e.name);

        const { count, ...fields } = base;
        const rows: Row[] = combatantNames(base.name, count, existingNames).map((name, index) => ({
          ...fields,
          encounter_id: encounterId,
          name,
          sort_order: existingNames.length + index,
        }));

        const created =
          (unwrap(await sb().from('encounter_combatants').insert(rows).select(), '참가자를 추가하지 못했습니다.') as
            | Combatant[]
            | null) ?? [];
        // insert가 조용히 0건을 돌려주면 화면에는 아무 일도 일어나지 않는다. 원인을 알려 준다.
        if (created.length === 0) {
          throw new AppError('참가자를 추가하지 못했습니다. 전투를 관리할 권한이 있는지 확인해 주세요.', 'forbidden');
        }
        return created;
      },
      async updateCombatant(id, patch) {
        const update = { ...patch };
        if (patch.dex_score !== undefined) update.dex_mod = Math.floor((patch.dex_score - 10) / 2);
        return unwrap(
          await sb().from('encounter_combatants').update(update).eq('id', id).select().single(),
          '참가자를 저장하지 못했습니다.',
        ) as Combatant;
      },
      async removeCombatant(id) {
        unwrapVoid(await sb().from('encounter_combatants').delete().eq('id', id), '참가자를 제거하지 못했습니다.');
      },
      async applyHp(encounterId, inputs) {
        // HP 계산은 서버 함수에서 수행해 동시 수정을 안전하게 처리한다.
        const { error } = await sb().rpc('apply_hp_changes', {
          p_encounter_id: encounterId,
          p_changes: inputs.map((i) => ({ combatant_id: i.combatantId, amount: i.amount, kind: i.kind })),
        });
        if (error) {
          // 서버 함수가 없는 구버전 스키마에서는 클라이언트에서 계산한다.
          const combatants = await this.combatants(encounterId);
          const updated: Combatant[] = [];
          for (const input of inputs) {
            const combatant = combatants.find((c) => c.id === input.combatantId);
            if (!combatant) continue;
            const state = { hp: combatant.hp, maxHp: combatant.max_hp, tempHp: combatant.temp_hp };
            let patch: Partial<Combatant> = {};
            if (input.kind === 'damage') {
              const result = applyDamage(state, input.amount);
              patch = { hp: result.hp, temp_hp: result.tempHp, is_defeated: result.hp === 0 };
            } else if (input.kind === 'heal') {
              const result = applyHealing(state, input.amount);
              patch = { hp: result.hp, is_defeated: false };
            } else if (input.kind === 'temp') {
              patch = { temp_hp: setTempHp(state, input.amount).tempHp };
            } else if (input.kind === 'set_hp') {
              const hp = Math.max(0, Math.min(state.maxHp, Math.floor(input.amount)));
              patch = { hp, is_defeated: hp <= 0 };
            } else {
              const result = setMaxHp(state, input.amount);
              patch = { hp: result.hp, max_hp: result.maxHp };
            }
            updated.push(await this.updateCombatant(input.combatantId, patch));
          }
          return updated;
        }
        return this.combatants(encounterId);
      },
      async nextTurn(encounterId) {
        const [encounter, combatants] = await Promise.all([
          sb().from('encounters').select('*').eq('id', encounterId).single(),
          this.combatants(encounterId),
        ]);
        const current = unwrap(encounter, '전투를 찾을 수 없습니다.') as Encounter;
        const order = turnOrder(combatants, current.tiebreak_rule);
        const state = nextTurn(order, { round: current.round, activeCombatantId: current.active_combatant_id });
        return this.updateEncounter(encounterId, {
          round: state.round,
          active_combatant_id: state.activeCombatantId,
          turn_started_at: new Date().toISOString(),
        });
      },
      async previousTurn(encounterId) {
        const [encounter, combatants] = await Promise.all([
          sb().from('encounters').select('*').eq('id', encounterId).single(),
          this.combatants(encounterId),
        ]);
        const current = unwrap(encounter, '전투를 찾을 수 없습니다.') as Encounter;
        const order = turnOrder(combatants, current.tiebreak_rule);
        const state = previousTurn(order, { round: current.round, activeCombatantId: current.active_combatant_id });
        return this.updateEncounter(encounterId, { round: state.round, active_combatant_id: state.activeCombatantId });
      },
      async setActive(encounterId, combatantId) {
        return this.updateEncounter(encounterId, { active_combatant_id: combatantId, turn_started_at: new Date().toISOString() });
      },
      async setRound(encounterId, round) {
        return this.updateEncounter(encounterId, { round: Math.max(0, Math.floor(round)) });
      },
      async addCondition(combatantId, input) {
        const template = CONDITION_MAP.get(input.condition_key);
        const added = Math.max(1, Math.min(999, Math.round(input.stacks ?? 1)));

        // 이미 걸린 상태를 다시 적용하면 새로 만들지 않고 스택을 올린다(데모 어댑터와 같은 규칙).
        const { data: existing } = await sb()
          .from('combatant_conditions')
          .select('*')
          .eq('combatant_id', combatantId)
          .eq('condition_key', input.condition_key)
          .limit(1)
          .maybeSingle();
        if (existing) {
          const current = (existing as CombatantCondition).stacks ?? 1;
          const bumped = await this.setConditionStacks((existing as CombatantCondition).id, current + added);
          if (bumped) return bumped;
        }

        const row: Row = {
          combatant_id: combatantId,
          condition_key: input.condition_key,
          custom_name: input.custom_name ?? template?.name ?? input.condition_key,
          icon: input.icon ?? template?.icon ?? 'circle',
          description: input.description ?? template?.description ?? '',
          duration_mode: input.duration_mode,
          duration_rounds: input.duration_rounds ?? null,
          source_combatant_id: input.source_combatant_id ?? null,
          linked_concentration: input.linked_concentration ?? false,
          is_public: input.is_public ?? true,
          stacks: added,
        };

        const first = await sb().from('combatant_conditions').insert(row).select().single();
        if (isMissingColumn(first.error)) {
          // 0007 마이그레이션 전 스키마에도 상태 적용은 되게 한다.
          const { stacks: _stacks, ...withoutStacks } = row;
          return unwrap(
            await sb().from('combatant_conditions').insert(withoutStacks).select().single(),
            '상태 효과를 적용하지 못했습니다.',
          ) as CombatantCondition;
        }
        return unwrap(first, '상태 효과를 적용하지 못했습니다.') as CombatantCondition;
      },
      async removeCondition(id) {
        unwrapVoid(await sb().from('combatant_conditions').delete().eq('id', id), '상태 효과를 해제하지 못했습니다.');
      },
      async setConditionStacks(id, stacks) {
        const next = Math.min(999, Math.round(stacks));
        if (next <= 0) {
          unwrapVoid(await sb().from('combatant_conditions').delete().eq('id', id), '상태 효과를 해제하지 못했습니다.');
          return null;
        }
        const data = unwrap(
          await sb().from('combatant_conditions').update({ stacks: next }).eq('id', id).select().single(),
          '상태 효과를 변경하지 못했습니다.',
        );
        return data as CombatantCondition;
      },

      async conditionLibrary(campaignId) {
        // 시스템 기본(campaign_id is null) + 이 캠페인 전용을 함께 가져온다.
        // RLS가 구성원이 아닌 캠페인의 상태를 걸러 낸다.
        const filter = `campaign_id.is.null,campaign_id.eq.${campaignId}`;
        const full = await sb()
          .from('conditions')
          .select('*')
          .or(filter)
          .order('campaign_id', { nullsFirst: true })
          .order('sort_order');

        if (isMissingColumn(full.error)) {
          // 0007 마이그레이션 전 스키마에서도 목록은 보이게 한다(정렬·색상만 기본값).
          const basic = unwrap(
            await sb().from('conditions').select('*').or(filter).order('name'),
            '상태 효과 목록을 불러오지 못했습니다.',
          ) as Condition[];
          return basic.map((row) => ({ ...row, is_stackable: row.is_stackable ?? false, color: row.color ?? null, sort_order: row.sort_order ?? 0 }));
        }

        return (unwrap(full, '상태 효과 목록을 불러오지 못했습니다.') as Condition[]) ?? [];
      },

      async saveConditionTemplate(campaignId, input) {
        const name = input.name.trim();
        if (!name) throw new AppError('상태 이름을 입력해 주세요.', 'validation');

        if (input.id) {
          const data = unwrap(
            await sb()
              .from('conditions')
              .update({
                name,
                icon: input.icon,
                description: input.description,
                is_stackable: input.is_stackable,
                color: input.color,
                sort_order: input.sort_order,
              })
              .eq('id', input.id)
              .eq('campaign_id', campaignId)
              .select()
              .single(),
            '상태 효과를 저장하지 못했습니다.',
          );
          return data as Condition;
        }

        const key = (input.key ?? name).trim().toLowerCase().replace(/\s+/g, '-');
        const data = unwrap(
          await sb()
            .from('conditions')
            .insert({
              campaign_id: campaignId,
              key,
              name,
              icon: input.icon ?? 'sparkles',
              description: input.description ?? '',
              is_stackable: input.is_stackable ?? false,
              color: input.color ?? null,
              sort_order: input.sort_order ?? 0,
            })
            .select()
            .single(),
          '상태 효과를 만들지 못했습니다.',
        );
        return data as Condition;
      },

      async deleteConditionTemplate(id) {
        // 시스템 기본 상태는 campaign_id가 null이라 RLS가 삭제를 막는다.
        unwrapVoid(await sb().from('conditions').delete().eq('id', id), '상태 효과를 삭제하지 못했습니다.');
      },

      async setConcentration(combatantId, on, note) {
        if (!on) {
          await sb().from('combatant_conditions').delete().eq('combatant_id', combatantId).eq('linked_concentration', true);
        }
        return unwrap(
          await sb()
            .from('encounter_combatants')
            .update({ is_concentrating: on, concentration_note: on ? (note ?? '') : '' })
            .eq('id', combatantId)
            .select()
            .single(),
          '집중 상태를 변경하지 못했습니다.',
        ) as Combatant;
      },
    },

    timers: {
      async list(sessionId) {
        return unwrap(
          await sb().from('timers').select('*').eq('session_id', sessionId).order('created_at'),
          '타이머를 불러오지 못했습니다.',
        ) as Timer[];
      },
      async create(sessionId, input) {
        const userId = await currentUserId();
        return unwrap(
          await sb()
            .from('timers')
            .insert({
              session_id: sessionId,
              name: input.name?.trim() || '새 타이머',
              description: input.description ?? '',
              kind: input.kind ?? 'countdown',
              duration_seconds: input.duration_seconds ?? 60,
              is_shared: input.is_shared ?? true,
              end_message: input.end_message ?? '',
              sound_on_end: input.sound_on_end ?? false,
              created_by: userId,
            })
            .select()
            .single(),
          '타이머를 만들지 못했습니다.',
        ) as Timer;
      },
      async update(id, patch) {
        return unwrap(await sb().from('timers').update(patch).eq('id', id).select().single(), '타이머를 저장하지 못했습니다.') as Timer;
      },
      async remove(id) {
        unwrapVoid(await sb().from('timers').delete().eq('id', id), '타이머를 삭제하지 못했습니다.');
      },
    },

    dice: {
      async list(sessionId, limit = 50) {
        return unwrap(
          await sb().from('dice_rolls').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(limit),
          '주사위 기록을 불러오지 못했습니다.',
        ) as DiceRoll[];
      },
      async roll(input) {
        const userId = await currentUserId();
        // 굴림 결과는 클라이언트에서 생성하되, 기록은 RLS가 통제하는 테이블에 남긴다.
        const result = rollExpression(input.expression);
        return unwrap(
          await sb()
            .from('dice_rolls')
            .insert({
              session_id: input.sessionId,
              campaign_id: input.campaignId,
              user_id: userId,
              expression: result.expression,
              detail: result.detail,
              total: result.total,
              purpose: input.purpose ?? '',
              visibility: input.visibility,
            })
            .select()
            .single(),
          '주사위 결과를 저장하지 못했습니다.',
        ) as DiceRoll;
      },
    },

    notifications: {
      async list() {
        return unwrap(
          await sb().from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
          '알림을 불러오지 못했습니다.',
        ) as AppNotification[];
      },
      async markRead(ids) {
        if (ids.length === 0) return;
        unwrapVoid(
          await sb().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids),
          '알림을 읽음 처리하지 못했습니다.',
        );
      },
      async markAllRead() {
        const userId = await currentUserId();
        unwrapVoid(
          await sb().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null),
          '알림을 읽음 처리하지 못했습니다.',
        );
      },
    },

    files: {
      async upload(campaignId, file, onProgress) {
        const userId = await currentUserId();
        const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        // 저장 파일 이름을 무작위화한다 (원본 이름은 메타데이터로만 보관).
        const path = `${campaignId}/${crypto.randomUUID()}.${ext}`;
        onProgress?.(10);
        const { error } = await sb().storage.from('campaign-media').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        });
        if (error) throw new AppError('파일을 업로드하지 못했습니다. 용량과 형식을 확인해 주세요.', 'validation', error);
        onProgress?.(80);
        const { data: signed } = await sb().storage.from('campaign-media').createSignedUrl(path, 60 * 60 * 24 * 7);
        const record = unwrap(
          await sb()
            .from('uploaded_files')
            .insert({
              campaign_id: campaignId,
              owner_id: userId,
              bucket: 'campaign-media',
              path,
              mime_type: file.type,
              size_bytes: file.size,
              original_name: file.name,
            })
            .select()
            .single(),
          '파일 정보를 저장하지 못했습니다.',
        ) as UploadedFile;
        onProgress?.(100);
        return { ...record, url: signed?.signedUrl ?? '', thumb_url: signed?.signedUrl ?? null };
      },
      async list(campaignId) {
        const rows = (unwrap(
          await sb().from('uploaded_files').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false }),
          '파일 목록을 불러오지 못했습니다.',
        ) as UploadedFile[]) ?? [];
        const paths = rows.map((r) => r.path);
        if (paths.length === 0) return rows;
        const { data: signed } = await sb().storage.from('campaign-media').createSignedUrls(paths, 60 * 60 * 24 * 7);
        return rows.map((row, index) => ({
          ...row,
          url: signed?.[index]?.signedUrl ?? '',
          thumb_url: signed?.[index]?.signedUrl ?? null,
        }));
      },
      async remove(id) {
        const file = unwrap(await sb().from('uploaded_files').select('*').eq('id', id).single(), '파일을 찾을 수 없습니다.') as UploadedFile;
        await sb().storage.from(file.bucket).remove([file.path]);
        unwrapVoid(await sb().from('uploaded_files').delete().eq('id', id), '파일을 삭제하지 못했습니다.');
      },
    },

    ai: {
      async generateMonster(campaignId, input) {
        const { data, error } = await sb().functions.invoke('generate-monster', {
          body: { campaign_id: campaignId, ...input },
        });
        if (error) {
          const message = await edgeErrorMessage(
            error,
            'AI 몬스터 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
          );
          throw new AppError(message, 'unknown', error);
        }
        const payload = data as { monster?: unknown; error?: string };
        if (payload?.error) throw new AppError(payload.error, 'validation');
        const parsed = generatedMonsterSchema.safeParse(payload?.monster);
        if (!parsed.success) {
          throw new AppError('AI가 생성한 데이터 형식이 올바르지 않습니다. 다시 시도해 주세요.', 'validation', parsed.error);
        }
        return parsed.data;
      },
    },

    realtime: {
      subscribeSession(sessionId, handler) {
        return subscribe(
          `session:${sessionId}`,
          [
            { table: 'encounters', filter: `session_id=eq.${sessionId}` },
            { table: 'encounter_combatants' },
            { table: 'combatant_conditions' },
            { table: 'timers', filter: `session_id=eq.${sessionId}` },
            { table: 'dice_rolls', filter: `session_id=eq.${sessionId}` },
            { table: 'session_logs', filter: `session_id=eq.${sessionId}` },
            { table: 'sessions', filter: `id=eq.${sessionId}` },
            { table: 'session_participants', filter: `session_id=eq.${sessionId}` },
          ],
          handler,
        );
      },
      subscribeCampaign(campaignId, handler) {
        return subscribe(
          `campaign:${campaignId}`,
          [
            { table: 'cards', filter: `campaign_id=eq.${campaignId}` },
            { table: 'player_characters', filter: `campaign_id=eq.${campaignId}` },
            { table: 'campaign_members', filter: `campaign_id=eq.${campaignId}` },
            { table: 'sessions', filter: `campaign_id=eq.${campaignId}` },
          ],
          handler,
        );
      },
      subscribeUser(userId, handler) {
        return subscribe(`user:${userId}`, [{ table: 'notifications', filter: `user_id=eq.${userId}` }], handler);
      },
      onStatusChange(cb) {
        statusListeners.add(cb);
        cb(connectionStatus);
        return () => statusListeners.delete(cb);
      },
      status() {
        return connectionStatus;
      },
    },
  };
}

/** 플레이어 화면에서 서버 뷰를 쓰지 못하는 경우를 대비한 클라이언트 측 재확인 */
export const clientSideProjection = projectCardForViewer;
