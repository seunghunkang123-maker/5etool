import {
  AppError,
  type AuthUser,
  type CampaignExport,
  type CampaignInput,
  type CampaignWithMeta,
  type CardInput,
  type CombatantInput,
  type ConditionInput,
  type ConnectionStatus,
  type DamageInput,
  type ImportPreview,
  type ImportStrategy,
  type RealtimeHandler,
  type Repository,
  type RevealInput,
  type SessionState,
} from '../repository';
import type {
  AppNotification,
  AuditLog,
  Campaign,
  CampaignInvite,
  CampaignMember,
  CampaignRole,
  Card,
  CardSection,
  CardTemplate,
  CharacterResource,
  Combatant,
  CombatantCondition,
  Condition,
  DeletedItem,
  DiceRoll,
  DiceVisibility,
  Encounter,
  Folder,
  GameSession,
  MonsterStats,
  Permissions,
  PlayerCharacter,
  Profile,
  RevealScope,
  SessionLog,
  SessionParticipant,
  Tag,
  Timer,
  UploadedFile,
  UUID,
  ViewerContext,
} from '../types';
import {
  defaultCampaignFields,
  defaultCharacter,
  defaultMonsterStats,
  defaultPreferences,
  emptySummary,
  SYSTEM_TEMPLATES,
} from '../defaults';
import { generateJoinCode, hashPassword, localStore, makeEvent, nowISO, uid } from './store';
import { filterCards, rankCards, type CardFilter } from '@/domain/search';
import { projectCardForViewer, type VisibleCard } from '@/domain/reveal';
import { canViewPrivateAssets, canEditAssets, canManageCombat, DEFAULT_PERMISSIONS, isDM, isOwner } from '@/domain/permissions';
import { applyDamage, applyHealing, setMaxHp, setTempHp } from '@/domain/hp';
import { nextTurn, previousTurn, turnOrder, uniqueCombatantName } from '@/domain/initiative';
import { rollExpression } from '@/domain/dice';
import { generatedMonsterSchema, type GeneratedMonster, type MonsterPromptInput } from '@/domain/monsterSchema';
import { CONDITION_MAP, DND5E_CONDITIONS } from '@/domain/conditions';
import { docToPlainText } from '@/domain/sanitize';

/**
 * 데모 모드 저장소 어댑터.
 * Supabase 없이 앱 전체 흐름을 실행할 수 있게 한다(E2E 테스트도 이 어댑터로 동작).
 */

const authListeners = new Set<(state: SessionState) => void>();

function db() {
  return localStore.data;
}

function requireUserId(): UUID {
  const id = localStore.getCurrentUserId();
  if (!id) throw new AppError('로그인이 필요합니다.', 'unauthorized');
  return id;
}

function findOrThrow<T>(list: T[], predicate: (item: T) => boolean, message: string): T {
  const found = list.find(predicate);
  if (!found) throw new AppError(message, 'not_found');
  return found;
}

function membershipOf(campaignId: UUID, userId: UUID): CampaignMember | null {
  return db().members.find((m) => m.campaign_id === campaignId && m.user_id === userId) ?? null;
}

function viewerOf(campaignId: UUID): ViewerContext {
  const userId = requireUserId();
  const member = membershipOf(campaignId, userId);
  if (!member) throw new AppError('이 캠페인에 접근할 권한이 없습니다.', 'forbidden');
  return { userId, role: member.role, permissions: member.permissions ?? {} };
}

function assert(condition: unknown, message: string, code: AppError['code'] = 'forbidden'): asserts condition {
  if (!condition) throw new AppError(message, code);
}

/** 데모 모드에는 파일 저장소가 없으므로 이미지를 data URL로 바꿔 보관한다. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AppError('이미지를 읽지 못했습니다.', 'validation'));
    reader.readAsDataURL(file);
  });
}

function profileOf(userId: UUID): Profile | null {
  return db().profiles.find((p) => p.id === userId) ?? null;
}

function displayNameOf(userId: UUID): string {
  return profileOf(userId)?.display_name ?? '알 수 없는 사용자';
}

function campaignOfSession(sessionId: UUID): GameSession {
  return findOrThrow(db().sessions, (s) => s.id === sessionId, '세션을 찾을 수 없습니다.');
}

function hydrateCard(card: Card): Card {
  const data = db();
  return {
    ...card,
    tag_ids: data.cardTags.filter((ct) => ct.card_id === card.id).map((ct) => ct.tag_id),
    stats: data.monsterStats.find((s) => s.card_id === card.id) ?? null,
    sections: data.sections.filter((s) => s.card_id === card.id).sort((a, b) => a.sort_order - b.sort_order),
  };
}

function hydrateCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    conditions: db().conditions.filter((c) => c.combatant_id === combatant.id),
  };
}

function pushLog(sessionId: UUID | null, log: Partial<SessionLog>): void {
  if (!sessionId) return;
  const session = db().sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const userId = localStore.getCurrentUserId();
  const entry: SessionLog = {
    id: uid(),
    session_id: sessionId,
    campaign_id: session.campaign_id,
    actor_id: userId,
    actor_name: userId ? displayNameOf(userId) : '시스템',
    event_type: log.event_type ?? 'unknown',
    target_type: log.target_type ?? null,
    target_id: log.target_id ?? null,
    target_name: log.target_name ?? '',
    before: log.before ?? null,
    after: log.after ?? null,
    message: log.message ?? '',
    visibility: log.visibility ?? 'dm',
    undone: false,
    created_at: nowISO(),
  };
  db().sessionLogs.push(entry);
  localStore.commit(makeEvent('session_logs', 'INSERT', entry as unknown as Record<string, unknown>));
}

function pushAudit(campaignId: UUID | null, action: string, meta: Record<string, unknown> = {}): void {
  const userId = localStore.getCurrentUserId();
  const entry: AuditLog = {
    id: uid(),
    campaign_id: campaignId,
    actor_id: userId,
    actor_name: userId ? displayNameOf(userId) : '시스템',
    action,
    target_type: typeof meta.target_type === 'string' ? meta.target_type : null,
    target_id: typeof meta.target_id === 'string' ? meta.target_id : null,
    meta,
    created_at: nowISO(),
  };
  db().auditLogs.push(entry);
  localStore.commit(makeEvent('audit_logs', 'INSERT', entry as unknown as Record<string, unknown>));
}

function notify(userIds: UUID[], notification: Omit<AppNotification, 'id' | 'user_id' | 'read_at' | 'created_at'>): void {
  for (const userId of userIds) {
    const entry: AppNotification = {
      ...notification,
      id: uid(),
      user_id: userId,
      read_at: null,
      created_at: nowISO(),
    };
    db().notifications.push(entry);
    localStore.commit(makeEvent('notifications', 'INSERT', entry as unknown as Record<string, unknown>));
  }
}

function playerIdsOf(campaignId: UUID): UUID[] {
  return db()
    .members.filter((m) => m.role === 'player' || m.role === 'spectator')
    .filter((m) => m.campaign_id === campaignId)
    .map((m) => m.user_id);
}

function sessionState(): SessionState {
  const userId = localStore.getCurrentUserId();
  if (!userId) return { user: null, profile: null };
  const account = db().accounts.find((a) => a.id === userId);
  const profile = profileOf(userId);
  if (!account || !profile) return { user: null, profile: null };
  const user: AuthUser = { id: account.id, email: account.email, email_confirmed: account.email_confirmed };
  return { user, profile };
}

function emitAuth(): void {
  const state = sessionState();
  for (const listener of authListeners) listener(state);
}

function trash(campaignId: UUID, entityType: string, entityId: UUID, label: string, payload: unknown): void {
  const item: DeletedItem = {
    id: uid(),
    campaign_id: campaignId,
    entity_type: entityType,
    entity_id: entityId,
    label,
    payload,
    deleted_by: requireUserId(),
    deleted_at: nowISO(),
    purge_after: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  };
  db().deletedItems.push(item);
}

/**
 * 저장소 내부 객체의 참조가 그대로 밖으로 나가면
 * UI 캐시(React Query)가 같은 객체를 들고 있게 되어 변경을 감지하지 못한다.
 * 모든 읽기 결과를 복사본으로 돌려주어 "서버가 스냅샷을 반환하는" 동작을 재현한다.
 */
function snapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    // 복사할 수 없는 값(함수 등)은 그대로 돌려준다.
    return value;
  }
}

type AnyFn = (...args: never[]) => unknown;

function withSnapshots<T extends Record<string, unknown>>(section: T): T {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(section)) {
    if (typeof value !== 'function') {
      wrapped[key] = value;
      continue;
    }
    const fn = value as AnyFn;
    wrapped[key] = (...args: never[]) => {
      const result = fn(...args);
      if (result instanceof Promise) return result.then(snapshot);
      return snapshot(result);
    };
  }
  return wrapped as T;
}

export function createLocalRepository(): Repository {
  const statusListeners = new Set<(status: ConnectionStatus) => void>();

  const repository: Repository = {
    mode: 'local',

    auth: {
      async getSession() {
        return sessionState();
      },
      onChange(cb) {
        authListeners.add(cb);
        return () => authListeners.delete(cb);
      },
      async signUp(email, password, displayName) {
        const normalized = email.trim().toLowerCase();
        if (db().accounts.some((a) => a.email === normalized)) {
          throw new AppError('이미 가입된 이메일입니다.', 'conflict');
        }
        if (password.length < 8) throw new AppError('비밀번호는 8자 이상이어야 합니다.', 'validation');
        const id = uid();
        db().accounts.push({ id, email: normalized, password_hash: await hashPassword(password), email_confirmed: true });
        const profile: Profile = {
          id,
          email: normalized,
          display_name: displayName.trim() || normalized.split('@')[0] || '모험가',
          avatar_url: null,
          locale: 'ko',
          is_admin: db().accounts.length === 1,
          created_at: nowISO(),
        };
        db().profiles.push(profile);
        db().preferences.push(defaultPreferences(id));
        localStore.setCurrentUserId(id);
        localStore.commit(makeEvent('profiles', 'INSERT', profile as unknown as Record<string, unknown>));
        emitAuth();
        return sessionState();
      },
      async signIn(email, password) {
        const normalized = email.trim().toLowerCase();
        const account = db().accounts.find((a) => a.email === normalized);
        const hash = await hashPassword(password);
        if (!account || account.password_hash !== hash) {
          throw new AppError('이메일 또는 비밀번호가 올바르지 않습니다.', 'unauthorized');
        }
        localStore.setCurrentUserId(account.id);
        emitAuth();
        return sessionState();
      },
      async signOut() {
        localStore.setCurrentUserId(null);
        emitAuth();
      },
      async signOutEverywhere() {
        localStore.setCurrentUserId(null);
        emitAuth();
      },
      async requestPasswordReset() {
        // 데모 모드에서는 메일을 보내지 않는다.
      },
      async updatePassword(newPassword) {
        const userId = requireUserId();
        const account = findOrThrow(db().accounts, (a) => a.id === userId, '계정을 찾을 수 없습니다.');
        if (newPassword.length < 8) throw new AppError('비밀번호는 8자 이상이어야 합니다.', 'validation');
        account.password_hash = await hashPassword(newPassword);
        localStore.persist();
      },
      async resendVerification() {
        // 데모 모드에서는 즉시 인증 완료 상태다.
      },
      async updateProfile(patch) {
        const userId = requireUserId();
        const profile = findOrThrow(db().profiles, (p) => p.id === userId, '프로필을 찾을 수 없습니다.');
        // 허용된 열만 반영한다. 운영 전용 열(is_admin, is_suspended)은 사용자가 바꿀 수 없다.
        // (운영 환경에서는 profiles의 열 단위 GRANT가 같은 규칙을 데이터베이스에서 강제한다.)
        if (patch.display_name !== undefined) profile.display_name = patch.display_name;
        if (patch.avatar_url !== undefined) profile.avatar_url = patch.avatar_url;
        if (patch.locale !== undefined) profile.locale = patch.locale;
        localStore.commit(makeEvent('profiles', 'UPDATE', profile as unknown as Record<string, unknown>));
        emitAuth();
        return profile;
      },
      async uploadAvatar(file) {
        const userId = requireUserId();
        const profile = findOrThrow(db().profiles, (p) => p.id === userId, '프로필을 찾을 수 없습니다.');

        // 운영 환경과 같은 제한을 적용한다. 확장자가 아니라 MIME type을 본다.
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          throw new AppError('PNG, JPEG, WebP 이미지만 사용할 수 있습니다.', 'validation');
        }
        if (file.size > 2 * 1024 * 1024) {
          throw new AppError('프로필 이미지는 2MB를 넘을 수 없습니다.', 'validation');
        }

        // 데모 모드에는 저장소가 없으므로 data URL로 보관한다.
        profile.avatar_url = await fileToDataUrl(file);
        localStore.commit(makeEvent('profiles', 'UPDATE', profile as unknown as Record<string, unknown>));
        emitAuth();
        return profile;
      },
      async removeAvatar() {
        const userId = requireUserId();
        const profile = findOrThrow(db().profiles, (p) => p.id === userId, '프로필을 찾을 수 없습니다.');
        profile.avatar_url = null;
        localStore.commit(makeEvent('profiles', 'UPDATE', profile as unknown as Record<string, unknown>));
        emitAuth();
        return profile;
      },
      async deleteAccount() {
        const userId = requireUserId();
        const data = db();
        data.accounts = data.accounts.filter((a) => a.id !== userId);
        data.profiles = data.profiles.filter((p) => p.id !== userId);
        data.members = data.members.filter((m) => m.user_id !== userId);
        data.campaigns = data.campaigns.filter((c) => c.owner_id !== userId);
        localStore.setCurrentUserId(null);
        localStore.persist();
        emitAuth();
      },
      async getPreferences() {
        const userId = requireUserId();
        let prefs = db().preferences.find((p) => p.user_id === userId);
        if (!prefs) {
          prefs = defaultPreferences(userId);
          db().preferences.push(prefs);
          localStore.persist();
        }
        return prefs;
      },
      async savePreferences(patch) {
        const userId = requireUserId();
        let prefs = db().preferences.find((p) => p.user_id === userId);
        if (!prefs) {
          prefs = defaultPreferences(userId);
          db().preferences.push(prefs);
        }
        Object.assign(prefs, patch);
        localStore.persist();
        return prefs;
      },
    },

    campaigns: {
      async list() {
        const userId = requireUserId();
        const data = db();
        return data.members
          .filter((m) => m.user_id === userId)
          .map((m) => data.campaigns.find((c) => c.id === m.campaign_id))
          .filter((c): c is Campaign => Boolean(c) && !c?.deleted_at)
          .map((campaign) => {
            const sessions = data.sessions.filter((s) => s.campaign_id === campaign.id && !s.deleted_at);
            const past = sessions.filter((s) => s.ended_at).sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''));
            const upcoming = sessions
              .filter((s) => s.status === 'scheduled' && s.scheduled_at)
              .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
            const meta: CampaignWithMeta = {
              ...campaign,
              member_count: data.members.filter((mm) => mm.campaign_id === campaign.id).length,
              my_role: membershipOf(campaign.id, userId)?.role ?? 'player',
              owner_name: displayNameOf(campaign.owner_id),
              last_session_at: past[0]?.ended_at ?? null,
              next_session_at: upcoming[0]?.scheduled_at ?? null,
            };
            return meta;
          })
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      },
      async get(id) {
        viewerOf(id);
        return findOrThrow(db().campaigns, (c) => c.id === id && !c.deleted_at, '캠페인을 찾을 수 없습니다.');
      },
      async create(input: CampaignInput) {
        const userId = requireUserId();
        const campaign: Campaign = {
          id: uid(),
          owner_id: userId,
          name: input.name.trim(),
          ...defaultCampaignFields(),
          description: input.description ?? '',
          system: input.system ?? 'dnd5e',
          cover_url: input.cover_url ?? null,
          theme_color: input.theme_color ?? '#7c3aed',
          join_policy: input.join_policy ?? 'code',
          max_players: input.max_players ?? 6,
          is_mature: input.is_mature ?? false,
          join_code: generateJoinCode(),
          deleted_at: null,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        db().campaigns.push(campaign);
        db().members.push({
          campaign_id: campaign.id,
          user_id: userId,
          role: 'owner',
          permissions: { ...DEFAULT_PERMISSIONS.owner },
          joined_at: nowISO(),
        });
        localStore.commit(makeEvent('campaigns', 'INSERT', campaign as unknown as Record<string, unknown>));
        pushAudit(campaign.id, 'campaign.create', { name: campaign.name });
        return campaign;
      },
      async update(id, patch) {
        const viewer = viewerOf(id);
        assert(isOwner(viewer) || viewer.permissions.manage_campaign === true, '캠페인을 수정할 권한이 없습니다.');
        const campaign = findOrThrow(db().campaigns, (c) => c.id === id, '캠페인을 찾을 수 없습니다.');
        Object.assign(campaign, patch, { updated_at: nowISO() });
        localStore.commit(makeEvent('campaigns', 'UPDATE', campaign as unknown as Record<string, unknown>));
        return campaign;
      },
      async softDelete(id) {
        const viewer = viewerOf(id);
        assert(isOwner(viewer), '캠페인 삭제는 소유자만 할 수 있습니다.');
        const campaign = findOrThrow(db().campaigns, (c) => c.id === id, '캠페인을 찾을 수 없습니다.');
        campaign.deleted_at = nowISO();
        trash(id, 'campaign', id, campaign.name, campaign);
        localStore.commit(makeEvent('campaigns', 'UPDATE', campaign as unknown as Record<string, unknown>));
        pushAudit(id, 'campaign.delete', { name: campaign.name });
      },
      async restore(id) {
        const campaign = findOrThrow(db().campaigns, (c) => c.id === id, '캠페인을 찾을 수 없습니다.');
        campaign.deleted_at = null;
        localStore.commit(makeEvent('campaigns', 'UPDATE', campaign as unknown as Record<string, unknown>));
        pushAudit(id, 'campaign.restore', {});
      },
      async duplicate(id, name) {
        const viewer = viewerOf(id);
        assert(isOwner(viewer) || viewer.permissions.manage_campaign === true, '캠페인을 복제할 권한이 없습니다.');
        const source = findOrThrow(db().campaigns, (c) => c.id === id, '캠페인을 찾을 수 없습니다.');
        const clone: Campaign = {
          ...source,
          id: uid(),
          name,
          join_code: generateJoinCode(),
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        db().campaigns.push(clone);
        db().members.push({
          campaign_id: clone.id,
          user_id: viewer.userId,
          role: 'owner',
          permissions: { ...DEFAULT_PERMISSIONS.owner },
          joined_at: nowISO(),
        });

        const folderMap = new Map<UUID, UUID>();
        for (const folder of db().folders.filter((f) => f.campaign_id === id)) {
          const newId = uid();
          folderMap.set(folder.id, newId);
          db().folders.push({ ...folder, id: newId, campaign_id: clone.id });
        }
        for (const folder of db().folders.filter((f) => f.campaign_id === clone.id)) {
          if (folder.parent_id) folder.parent_id = folderMap.get(folder.parent_id) ?? null;
        }
        const tagMap = new Map<UUID, UUID>();
        for (const tag of db().tags.filter((t) => t.campaign_id === id)) {
          const newId = uid();
          tagMap.set(tag.id, newId);
          db().tags.push({ ...tag, id: newId, campaign_id: clone.id });
        }
        for (const card of db().cards.filter((c) => c.campaign_id === id && !c.deleted_at)) {
          const newId = uid();
          db().cards.push({
            ...card,
            id: newId,
            campaign_id: clone.id,
            folder_id: card.folder_id ? (folderMap.get(card.folder_id) ?? null) : null,
            reveal_scope: 'hidden',
            reveal_targets: [],
            created_at: nowISO(),
            updated_at: nowISO(),
            version: 1,
          });
          for (const link of db().cardTags.filter((ct) => ct.card_id === card.id)) {
            const mapped = tagMap.get(link.tag_id);
            if (mapped) db().cardTags.push({ card_id: newId, tag_id: mapped });
          }
          for (const section of db().sections.filter((s) => s.card_id === card.id)) {
            db().sections.push({ ...section, id: uid(), card_id: newId });
          }
          const stats = db().monsterStats.find((s) => s.card_id === card.id);
          if (stats) db().monsterStats.push({ ...stats, card_id: newId });
        }
        localStore.commit(makeEvent('campaigns', 'INSERT', clone as unknown as Record<string, unknown>));
        pushAudit(clone.id, 'campaign.duplicate', { from: id });
        return clone;
      },
      async regenerateJoinCode(id) {
        const viewer = viewerOf(id);
        assert(isOwner(viewer) || viewer.permissions.manage_players === true, '참여 코드를 변경할 권한이 없습니다.');
        const campaign = findOrThrow(db().campaigns, (c) => c.id === id, '캠페인을 찾을 수 없습니다.');
        campaign.join_code = generateJoinCode();
        localStore.commit(makeEvent('campaigns', 'UPDATE', campaign as unknown as Record<string, unknown>));
        pushAudit(id, 'campaign.regenerate_code', {});
        return campaign.join_code;
      },
      async joinByCode(code) {
        const userId = requireUserId();
        const campaign = db().campaigns.find(
          (c) => c.join_code.toUpperCase() === code.trim().toUpperCase() && !c.deleted_at,
        );
        if (!campaign) throw new AppError('참여 코드를 찾을 수 없습니다. 코드를 다시 확인해 주세요.', 'not_found');
        if (membershipOf(campaign.id, userId)) return campaign;
        const players = db().members.filter((m) => m.campaign_id === campaign.id && m.role === 'player').length;
        if (players >= campaign.max_players) {
          throw new AppError('이 캠페인은 정원이 가득 찼습니다.', 'forbidden');
        }
        const member: CampaignMember = {
          campaign_id: campaign.id,
          user_id: userId,
          role: 'player',
          permissions: {},
          joined_at: nowISO(),
        };
        db().members.push(member);
        localStore.commit(makeEvent('campaign_members', 'INSERT', member as unknown as Record<string, unknown>));
        notify([campaign.owner_id], {
          campaign_id: campaign.id,
          session_id: null,
          type: 'join_approved',
          title: '새 플레이어 참여',
          body: `${displayNameOf(userId)} 님이 "${campaign.name}"에 참여했습니다.`,
          data: {},
        });
        pushAudit(campaign.id, 'member.join', { user_id: userId });
        return campaign;
      },
      async members(id) {
        viewerOf(id);
        return db()
          .members.filter((m) => m.campaign_id === id)
          .map((m) => {
            const profile = profileOf(m.user_id);
            return {
              ...m,
              profile: profile
                ? { id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url, email: profile.email }
                : undefined,
            };
          });
      },
      async myMembership(id) {
        const userId = localStore.getCurrentUserId();
        if (!userId) return null;
        return membershipOf(id, userId);
      },
      async updateMember(campaignId, userId, patch) {
        const viewer = viewerOf(campaignId);
        assert(isOwner(viewer) || viewer.permissions.manage_players === true, '구성원 권한을 변경할 권한이 없습니다.');
        const member = findOrThrow(
          db().members,
          (m) => m.campaign_id === campaignId && m.user_id === userId,
          '구성원을 찾을 수 없습니다.',
        );
        assert(member.role !== 'owner', '소유자의 권한은 변경할 수 없습니다.');
        const before = { role: member.role, permissions: member.permissions };
        if (patch.role) {
          member.role = patch.role;
          member.permissions = { ...DEFAULT_PERMISSIONS[patch.role] };
        }
        if (patch.permissions) member.permissions = { ...member.permissions, ...patch.permissions };
        localStore.commit(makeEvent('campaign_members', 'UPDATE', member as unknown as Record<string, unknown>));
        pushAudit(campaignId, 'member.update_permissions', { user_id: userId, before, after: { role: member.role, permissions: member.permissions } });
        return member;
      },
      async removeMember(campaignId, userId) {
        const viewer = viewerOf(campaignId);
        assert(
          isOwner(viewer) || viewer.permissions.manage_players === true || viewer.userId === userId,
          '구성원을 내보낼 권한이 없습니다.',
        );
        const data = db();
        const member = data.members.find((m) => m.campaign_id === campaignId && m.user_id === userId);
        assert(member?.role !== 'owner', '소유자는 캠페인에서 나갈 수 없습니다.');
        data.members = data.members.filter((m) => !(m.campaign_id === campaignId && m.user_id === userId));
        localStore.commit(makeEvent('campaign_members', 'DELETE', null, { campaign_id: campaignId, user_id: userId }));
        pushAudit(campaignId, 'member.remove', { user_id: userId });
      },
      async invite(campaignId, email, role) {
        const viewer = viewerOf(campaignId);
        assert(isOwner(viewer) || viewer.permissions.manage_players === true, '초대할 권한이 없습니다.');
        const campaign = findOrThrow(db().campaigns, (c) => c.id === campaignId, '캠페인을 찾을 수 없습니다.');
        const invite: CampaignInvite = {
          id: uid(),
          campaign_id: campaignId,
          email: email.trim().toLowerCase(),
          role,
          token: uid(),
          status: 'pending',
          created_at: nowISO(),
          expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
          campaign_name: campaign.name,
        };
        db().invites.push(invite);
        const target = db().profiles.find((p) => p.email === invite.email);
        if (target) {
          notify([target.id], {
            campaign_id: campaignId,
            session_id: null,
            type: 'campaign_invite',
            title: '캠페인 초대',
            body: `"${campaign.name}" 캠페인에 초대되었습니다.`,
            data: { invite_id: invite.id },
          });
        }
        localStore.commit(makeEvent('campaign_invites', 'INSERT', invite as unknown as Record<string, unknown>));
        pushAudit(campaignId, 'member.invite', { email: invite.email, role });
        return invite;
      },
      async listInvites(campaignId) {
        viewerOf(campaignId);
        return db().invites.filter((i) => i.campaign_id === campaignId);
      },
      async myInvites() {
        const userId = requireUserId();
        const profile = profileOf(userId);
        if (!profile) return [];
        return db()
          .invites.filter((i) => i.email === profile.email && i.status === 'pending')
          .map((i) => ({ ...i, campaign_name: db().campaigns.find((c) => c.id === i.campaign_id)?.name ?? '' }));
      },
      async respondToInvite(inviteId, accept) {
        const userId = requireUserId();
        const invite = findOrThrow(db().invites, (i) => i.id === inviteId, '초대를 찾을 수 없습니다.');
        if (new Date(invite.expires_at).getTime() < Date.now()) {
          throw new AppError('만료된 초대입니다. 던전 마스터에게 다시 요청해 주세요.', 'validation');
        }
        invite.status = accept ? 'accepted' : 'revoked';
        if (accept && !membershipOf(invite.campaign_id, userId)) {
          const member: CampaignMember = {
            campaign_id: invite.campaign_id,
            user_id: userId,
            role: invite.role,
            permissions: { ...DEFAULT_PERMISSIONS[invite.role] },
            joined_at: nowISO(),
          };
          db().members.push(member);
          localStore.commit(makeEvent('campaign_members', 'INSERT', member as unknown as Record<string, unknown>));
        }
        localStore.persist();
        pushAudit(invite.campaign_id, accept ? 'invite.accept' : 'invite.decline', { invite_id: inviteId });
      },
      async exportData(campaignId) {
        const viewer = viewerOf(campaignId);
        assert(canViewPrivateAssets(viewer), '내보낼 권한이 없습니다.');
        const data = db();
        const campaign = findOrThrow(data.campaigns, (c) => c.id === campaignId, '캠페인을 찾을 수 없습니다.');
        return {
          version: 1,
          exported_at: nowISO(),
          campaign,
          folders: data.folders.filter((f) => f.campaign_id === campaignId),
          tags: data.tags.filter((t) => t.campaign_id === campaignId),
          cards: data.cards.filter((c) => c.campaign_id === campaignId && !c.deleted_at).map(hydrateCard),
          characters: data.characters.filter((c) => c.campaign_id === campaignId),
          sessions: data.sessions.filter((s) => s.campaign_id === campaignId && !s.deleted_at),
        } satisfies CampaignExport;
      },
      async previewImport(raw) {
        const parsed = raw as Partial<CampaignExport>;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cards)) {
          throw new AppError('가져올 수 없는 파일 형식입니다. 앱에서 내보낸 JSON인지 확인해 주세요.', 'validation');
        }
        const existing = new Set(db().cards.map((c) => c.name));
        const preview: ImportPreview = {
          campaignName: parsed.campaign?.name ?? '이름 없는 캠페인',
          folders: parsed.folders?.length ?? 0,
          tags: parsed.tags?.length ?? 0,
          cards: parsed.cards.length,
          conflicts: parsed.cards.filter((c) => existing.has(c.name)).map((c) => ({ type: '카드', name: c.name })),
        };
        return preview;
      },
      async importData(campaignId, raw, strategy: ImportStrategy) {
        const userId = requireUserId();
        const parsed = raw as CampaignExport;
        if (!parsed?.cards) throw new AppError('가져올 수 없는 파일 형식입니다.', 'validation');

        let target: Campaign;
        if (campaignId) {
          const viewer = viewerOf(campaignId);
          assert(canEditAssets(viewer), '자료를 가져올 권한이 없습니다.');
          target = findOrThrow(db().campaigns, (c) => c.id === campaignId, '캠페인을 찾을 수 없습니다.');
        } else {
          target = {
            ...defaultCampaignFields(),
            ...parsed.campaign,
            id: uid(),
            owner_id: userId,
            join_code: generateJoinCode(),
            deleted_at: null,
            created_at: nowISO(),
            updated_at: nowISO(),
          };
          db().campaigns.push(target);
          db().members.push({
            campaign_id: target.id,
            user_id: userId,
            role: 'owner',
            permissions: { ...DEFAULT_PERMISSIONS.owner },
            joined_at: nowISO(),
          });
        }

        const folderMap = new Map<UUID, UUID>();
        for (const folder of parsed.folders ?? []) {
          const newId = uid();
          folderMap.set(folder.id, newId);
          db().folders.push({ ...folder, id: newId, campaign_id: target.id, deleted_at: null });
        }
        for (const folder of db().folders.filter((f) => f.campaign_id === target.id)) {
          if (folder.parent_id && folderMap.has(folder.parent_id)) folder.parent_id = folderMap.get(folder.parent_id) ?? null;
        }
        const tagMap = new Map<UUID, UUID>();
        for (const tag of parsed.tags ?? []) {
          const existing = db().tags.find((t) => t.campaign_id === target.id && t.name === tag.name);
          if (existing) {
            tagMap.set(tag.id, existing.id);
          } else {
            const newId = uid();
            tagMap.set(tag.id, newId);
            db().tags.push({ ...tag, id: newId, campaign_id: target.id });
          }
        }

        for (const card of parsed.cards) {
          const existing = db().cards.find((c) => c.campaign_id === target.id && c.name === card.name && !c.deleted_at);
          if (existing && strategy === 'skip') continue;
          const newId = existing && strategy === 'overwrite' ? existing.id : uid();
          const record: Card = {
            ...card,
            id: newId,
            campaign_id: target.id,
            folder_id: card.folder_id ? (folderMap.get(card.folder_id) ?? null) : null,
            name: existing && strategy === 'duplicate' ? `${card.name} (사본)` : card.name,
            created_by: userId,
            reveal_scope: 'hidden',
            reveal_targets: [],
            is_temporary_reveal: false,
            previous_scope: null,
            version: 1,
            deleted_at: null,
            created_at: nowISO(),
            updated_at: nowISO(),
          };
          if (existing && strategy === 'overwrite') {
            Object.assign(existing, record);
          } else {
            db().cards.push(record);
          }
          if (card.stats) {
            const stats = { ...card.stats, card_id: newId };
            const idx = db().monsterStats.findIndex((s) => s.card_id === newId);
            if (idx >= 0) db().monsterStats[idx] = stats;
            else db().monsterStats.push(stats);
          }
          if (card.sections) {
            const data = db();
            data.sections = data.sections.filter((s) => s.card_id !== newId);
            for (const section of card.sections) {
              data.sections.push({ ...section, id: uid(), card_id: newId });
            }
          }
          for (const tagId of card.tag_ids ?? []) {
            const mapped = tagMap.get(tagId);
            if (mapped && !db().cardTags.some((ct) => ct.card_id === newId && ct.tag_id === mapped)) {
              db().cardTags.push({ card_id: newId, tag_id: mapped });
            }
          }
        }
        localStore.commit(makeEvent('cards', 'INSERT', null));
        pushAudit(target.id, 'campaign.import', { cards: parsed.cards.length, strategy });
        return target;
      },
      async trash(campaignId) {
        viewerOf(campaignId);
        return db().deletedItems.filter((d) => d.campaign_id === campaignId);
      },
      async restoreItem(itemId) {
        const item = findOrThrow(db().deletedItems, (d) => d.id === itemId, '휴지통 항목을 찾을 수 없습니다.');
        if (item.entity_type === 'card') {
          const card = db().cards.find((c) => c.id === item.entity_id);
          if (card) card.deleted_at = null;
        } else if (item.entity_type === 'campaign') {
          const campaign = db().campaigns.find((c) => c.id === item.entity_id);
          if (campaign) campaign.deleted_at = null;
        } else if (item.entity_type === 'folder') {
          const folder = db().folders.find((f) => f.id === item.entity_id);
          if (folder) folder.deleted_at = null;
        } else if (item.entity_type === 'session') {
          const session = db().sessions.find((s) => s.id === item.entity_id);
          if (session) session.deleted_at = null;
        }
        const data = db();
        data.deletedItems = data.deletedItems.filter((d) => d.id !== itemId);
        localStore.commit(makeEvent('deleted_items', 'DELETE', null, { id: itemId }));
        pushAudit(item.campaign_id, 'trash.restore', { entity_type: item.entity_type, entity_id: item.entity_id });
      },
      async purgeItem(itemId) {
        const item = findOrThrow(db().deletedItems, (d) => d.id === itemId, '휴지통 항목을 찾을 수 없습니다.');
        const data = db();
        if (item.entity_type === 'card') data.cards = data.cards.filter((c) => c.id !== item.entity_id);
        data.deletedItems = data.deletedItems.filter((d) => d.id !== itemId);
        localStore.commit(makeEvent('deleted_items', 'DELETE', null, { id: itemId }));
        pushAudit(item.campaign_id, 'trash.purge', { entity_type: item.entity_type, entity_id: item.entity_id });
      },
      async auditLogs(campaignId) {
        const viewer = viewerOf(campaignId);
        assert(isOwner(viewer), '감사 로그는 캠페인 소유자만 볼 수 있습니다.');
        return db()
          .auditLogs.filter((a) => a.campaign_id === campaignId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
    },

    sessions: {
      async list(campaignId) {
        viewerOf(campaignId);
        return db()
          .sessions.filter((s) => s.campaign_id === campaignId && !s.deleted_at)
          .sort((a, b) => b.session_number - a.session_number);
      },
      async get(id) {
        const session = campaignOfSession(id);
        viewerOf(session.campaign_id);
        return session;
      },
      async create(campaignId, input) {
        const viewer = viewerOf(campaignId);
        assert(isOwner(viewer) || viewer.permissions.manage_session === true || viewer.permissions.manage_campaign === true, '세션을 만들 권한이 없습니다.');
        const existing = db().sessions.filter((s) => s.campaign_id === campaignId);
        const session: GameSession = {
          id: uid(),
          campaign_id: campaignId,
          title: input.title?.trim() || `${existing.length + 1}번째 세션`,
          session_number: input.session_number ?? existing.length + 1,
          scheduled_at: input.scheduled_at ?? null,
          started_at: null,
          ended_at: null,
          status: input.status ?? 'scheduled',
          description: input.description ?? '',
          cover_url: input.cover_url ?? null,
          summary: null,
          deleted_at: null,
          created_at: nowISO(),
        };
        db().sessions.push(session);
        localStore.commit(makeEvent('sessions', 'INSERT', session as unknown as Record<string, unknown>));
        return session;
      },
      async update(id, patch) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '세션을 수정할 권한이 없습니다.');
        const before = { ...session };
        Object.assign(session, patch);
        localStore.commit(makeEvent('sessions', 'UPDATE', session as unknown as Record<string, unknown>));
        if (patch.scheduled_at && patch.scheduled_at !== before.scheduled_at) {
          notify(playerIdsOf(session.campaign_id), {
            campaign_id: session.campaign_id,
            session_id: session.id,
            type: 'session_rescheduled',
            title: '세션 일정 변경',
            body: `"${session.title}" 일정이 변경되었습니다.`,
            data: {},
          });
        }
        return session;
      },
      async start(id) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '세션을 시작할 권한이 없습니다.');
        session.status = 'live';
        session.started_at = session.started_at ?? nowISO();
        localStore.commit(makeEvent('sessions', 'UPDATE', session as unknown as Record<string, unknown>));
        pushLog(id, { event_type: 'session.start', message: '세션이 시작되었습니다.', visibility: 'all' });
        notify(playerIdsOf(session.campaign_id), {
          campaign_id: session.campaign_id,
          session_id: session.id,
          type: 'session_started',
          title: '세션 시작',
          body: `"${session.title}" 세션이 시작되었습니다.`,
          data: {},
        });
        return session;
      },
      async end(id) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '세션을 종료할 권한이 없습니다.');
        session.status = 'ended';
        session.ended_at = nowISO();

        // 일시 공개 카드를 이전 상태로 되돌린다.
        for (const card of db().cards.filter((c) => c.campaign_id === session.campaign_id && c.is_temporary_reveal)) {
          card.reveal_scope = card.previous_scope ?? 'hidden';
          card.previous_scope = null;
          card.is_temporary_reveal = false;
          card.reveal_targets = [];
        }
        // 진행 중이던 전투와 타이머를 정리한다.
        for (const encounter of db().encounters.filter((e) => e.session_id === id && e.status !== 'ended')) {
          encounter.status = 'ended';
        }
        for (const timer of db().timers.filter((t) => t.session_id === id && t.state === 'running')) {
          timer.state = 'finished';
        }
        localStore.commit(makeEvent('sessions', 'UPDATE', session as unknown as Record<string, unknown>));
        pushLog(id, { event_type: 'session.end', message: '세션이 종료되었습니다.', visibility: 'all' });
        return session;
      },
      async remove(id) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isOwner(viewer), '세션을 삭제할 권한이 없습니다.');
        if (session.deleted_at) return; // 이미 지워진 세션

        // 진행 중인 세션을 지우면 일시 공개된 자료가 공개된 채로 남는다. 먼저 정리한다.
        for (const card of db().cards) {
          if (card.campaign_id === session.campaign_id && card.is_temporary_reveal) {
            card.reveal_scope = card.previous_scope ?? 'hidden';
            card.is_temporary_reveal = false;
            card.previous_scope = null;
          }
        }

        session.deleted_at = nowISO();
        if (session.status === 'live') session.status = 'cancelled';

        db().deletedItems.push({
          id: uid(),
          campaign_id: session.campaign_id,
          entity_type: 'session',
          entity_id: session.id,
          label: session.title || '제목 없는 세션',
          payload: session as unknown as Record<string, unknown>,
          deleted_by: viewer.userId,
          deleted_at: nowISO(),
          purge_after: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });

        localStore.commit(makeEvent('sessions', 'UPDATE', session as unknown as Record<string, unknown>));
        pushAudit(session.campaign_id, 'session.delete', { title: session.title, session_number: session.session_number });
      },
      async participants(id) {
        const session = campaignOfSession(id);
        viewerOf(session.campaign_id);
        const members = db().members.filter((m) => m.campaign_id === session.campaign_id);
        return members.map((m) => {
          const participant = db().participants.find((p) => p.session_id === id && p.user_id === m.user_id);
          return {
            session_id: id,
            user_id: m.user_id,
            display_name: displayNameOf(m.user_id),
            role: m.role,
            is_online: participant?.is_online ?? false,
            joined_at: participant?.joined_at ?? m.joined_at,
          } satisfies SessionParticipant;
        });
      },
      async join(id) {
        const userId = requireUserId();
        const session = campaignOfSession(id);
        viewerOf(session.campaign_id);
        const existing = db().participants.find((p) => p.session_id === id && p.user_id === userId);
        if (existing) {
          existing.is_online = true;
        } else {
          db().participants.push({
            session_id: id,
            user_id: userId,
            display_name: displayNameOf(userId),
            role: membershipOf(session.campaign_id, userId)?.role ?? 'player',
            is_online: true,
            joined_at: nowISO(),
          });
        }
        localStore.commit(makeEvent('session_participants', 'UPDATE', { session_id: id, user_id: userId }));
      },
      async logs(id, filter) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        const dm = canViewPrivateAssets(viewer);
        return db()
          .sessionLogs.filter((log) => log.session_id === id)
          .filter((log) => dm || log.visibility === 'all')
          .filter((log) => !filter?.eventType || log.event_type.startsWith(filter.eventType))
          .filter((log) => !filter?.query || `${log.message}${log.target_name}`.toLowerCase().includes(filter.query.toLowerCase()))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      },
      async appendLog(id, log) {
        pushLog(id, log);
        const entries = db().sessionLogs.filter((l) => l.session_id === id);
        const last = entries[entries.length - 1];
        if (!last) throw new AppError('로그를 기록하지 못했습니다.', 'unknown');
        return last;
      },
      async undoLog(logId) {
        const log = findOrThrow(db().sessionLogs, (l) => l.id === logId, '로그를 찾을 수 없습니다.');
        const session = campaignOfSession(log.session_id);
        const viewer = viewerOf(session.campaign_id);
        assert(canManageCombat(viewer), '변경을 취소할 권한이 없습니다.');
        assert(!log.undone, '이미 취소된 변경입니다.', 'conflict');

        if (log.target_type === 'combatant' && log.before && typeof log.before === 'object') {
          const combatant = db().combatants.find((c) => c.id === log.target_id);
          if (combatant) {
            Object.assign(combatant, log.before);
            localStore.commit(makeEvent('encounter_combatants', 'UPDATE', combatant as unknown as Record<string, unknown>));
          }
        } else if (log.target_type === 'card' && log.before && typeof log.before === 'object') {
          const card = db().cards.find((c) => c.id === log.target_id);
          if (card) {
            Object.assign(card, log.before);
            localStore.commit(makeEvent('cards', 'UPDATE', card as unknown as Record<string, unknown>));
          }
        }
        log.undone = true;
        localStore.persist();
      },
      async saveSummary(id, summary) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '세션 요약을 저장할 권한이 없습니다.');
        session.summary = summary;
        localStore.commit(makeEvent('sessions', 'UPDATE', session as unknown as Record<string, unknown>));
        return session;
      },
      async generateSummaryDraft(id) {
        const session = campaignOfSession(id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '요약을 생성할 권한이 없습니다.');
        const logs = db().sessionLogs.filter((l) => l.session_id === id);
        const revealed = logs.filter((l) => l.event_type === 'card.reveal').map((l) => l.target_name);
        const combats = logs.filter((l) => l.event_type === 'encounter.start').length;
        const damage = logs.filter((l) => l.event_type === 'combat.hp');
        return {
          ...emptySummary(),
          highlights: logs
            .filter((l) => l.visibility === 'all')
            .slice(-12)
            .map((l) => `- ${l.message}`)
            .join('\n'),
          npcs: [...new Set(revealed)].join(', '),
          combat_result: `진행된 전투 ${combats}회, HP 변경 ${damage.length}건`,
        };
      },
    },

    library: {
      async folders(campaignId) {
        viewerOf(campaignId);
        return db()
          .folders.filter((f) => f.campaign_id === campaignId && !f.deleted_at)
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ko'));
      },
      async createFolder(campaignId, input) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '폴더를 만들 권한이 없습니다.');
        const folder: Folder = {
          id: uid(),
          campaign_id: campaignId,
          parent_id: input.parent_id ?? null,
          name: input.name?.trim() || '새 폴더',
          color: input.color ?? null,
          icon: input.icon ?? null,
          sort_order: input.sort_order ?? db().folders.filter((f) => f.campaign_id === campaignId).length,
          deleted_at: null,
        };
        db().folders.push(folder);
        localStore.commit(makeEvent('folders', 'INSERT', folder as unknown as Record<string, unknown>));
        return folder;
      },
      async updateFolder(id, patch) {
        const folder = findOrThrow(db().folders, (f) => f.id === id, '폴더를 찾을 수 없습니다.');
        const viewer = viewerOf(folder.campaign_id);
        assert(canEditAssets(viewer), '폴더를 수정할 권한이 없습니다.');
        if (patch.parent_id === id) throw new AppError('폴더를 자기 자신 안으로 옮길 수 없습니다.', 'validation');
        Object.assign(folder, patch);
        localStore.commit(makeEvent('folders', 'UPDATE', folder as unknown as Record<string, unknown>));
        return folder;
      },
      async deleteFolder(id, mode) {
        const folder = findOrThrow(db().folders, (f) => f.id === id, '폴더를 찾을 수 없습니다.');
        const viewer = viewerOf(folder.campaign_id);
        assert(canEditAssets(viewer), '폴더를 삭제할 권한이 없습니다.');
        const cards = db().cards.filter((c) => c.folder_id === id && !c.deleted_at);
        for (const card of cards) {
          if (mode === 'trash_cards') {
            card.deleted_at = nowISO();
            trash(folder.campaign_id, 'card', card.id, card.name, card);
          } else if (mode === 'move_up') {
            card.folder_id = folder.parent_id;
          } else {
            card.folder_id = null;
          }
        }
        for (const child of db().folders.filter((f) => f.parent_id === id)) {
          child.parent_id = folder.parent_id;
        }
        folder.deleted_at = nowISO();
        trash(folder.campaign_id, 'folder', folder.id, folder.name, folder);
        localStore.commit(makeEvent('folders', 'DELETE', null, folder as unknown as Record<string, unknown>));
      },
      async tags(campaignId) {
        viewerOf(campaignId);
        return db().tags.filter((t) => t.campaign_id === campaignId);
      },
      async createTag(campaignId, name, color) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '태그를 만들 권한이 없습니다.');
        const trimmed = name.trim();
        const existing = db().tags.find((t) => t.campaign_id === campaignId && t.name === trimmed);
        if (existing) return existing;
        const tag: Tag = { id: uid(), campaign_id: campaignId, name: trimmed, color };
        db().tags.push(tag);
        localStore.commit(makeEvent('tags', 'INSERT', tag as unknown as Record<string, unknown>));
        return tag;
      },
      async updateTag(id, patch) {
        const tag = findOrThrow(db().tags, (t) => t.id === id, '태그를 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(tag.campaign_id)), '태그를 수정할 권한이 없습니다.');
        Object.assign(tag, patch);
        localStore.commit(makeEvent('tags', 'UPDATE', tag as unknown as Record<string, unknown>));
        return tag;
      },
      async deleteTag(id) {
        const tag = findOrThrow(db().tags, (t) => t.id === id, '태그를 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(tag.campaign_id)), '태그를 삭제할 권한이 없습니다.');
        const data = db();
        data.tags = data.tags.filter((t) => t.id !== id);
        data.cardTags = data.cardTags.filter((ct) => ct.tag_id !== id);
        localStore.commit(makeEvent('tags', 'DELETE', null, { id }));
      },
      async cards(campaignId, filter?: CardFilter) {
        const viewer = viewerOf(campaignId);
        assert(canViewPrivateAssets(viewer), '이 캠페인의 자료를 열람할 권한이 없습니다.');
        const all = db()
          .cards.filter((c) => c.campaign_id === campaignId)
          .map(hydrateCard);
        const folders = db().folders.filter((f) => f.campaign_id === campaignId);
        const filtered = filterCards(all, { includeDmNotes: true, ...filter }, folders);
        return filter?.query ? rankCards(filtered, filter.query) : filtered.sort((a, b) => a.sort_order - b.sort_order);
      },
      async visibleCards(campaignId) {
        const viewer = viewerOf(campaignId);
        return db()
          .cards.filter((c) => c.campaign_id === campaignId && !c.deleted_at && !c.is_archived)
          .map(hydrateCard)
          .map((card) => projectCardForViewer(card, viewer))
          .filter((c): c is VisibleCard => c !== null);
      },
      async card(id) {
        const card = findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.');
        const viewer = viewerOf(card.campaign_id);
        assert(canViewPrivateAssets(viewer), '이 카드를 열람할 권한이 없습니다.');
        return hydrateCard(card);
      },
      async createCard(campaignId, input: CardInput) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '카드를 만들 권한이 없습니다.');
        const card: Card = {
          id: uid(),
          campaign_id: campaignId,
          folder_id: input.folder_id ?? null,
          type: input.type,
          name: input.name.trim() || '이름 없는 카드',
          summary: input.summary ?? '',
          body: input.body ?? null,
          image_url: input.image_url ?? null,
          reveal_scope: 'hidden',
          reveal_fields: ['name', 'image'],
          reveal_targets: [],
          is_temporary_reveal: false,
          previous_scope: null,
          is_favorite: false,
          is_archived: false,
          sort_order: db().cards.filter((c) => c.campaign_id === campaignId).length,
          dm_notes: input.dm_notes ?? '',
          created_by: viewer.userId,
          version: 1,
          deleted_at: null,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        db().cards.push(card);
        for (const tagId of input.tag_ids ?? []) db().cardTags.push({ card_id: card.id, tag_id: tagId });
        if (input.stats || input.type === 'monster' || input.type === 'npc') {
          db().monsterStats.push({ ...defaultMonsterStats(card.id), ...(input.stats ?? {}), card_id: card.id });
        }
        for (const [index, section] of (input.sections ?? []).entries()) {
          db().sections.push({ ...section, id: uid(), card_id: card.id, sort_order: index });
        }
        localStore.commit(makeEvent('cards', 'INSERT', card as unknown as Record<string, unknown>));
        return hydrateCard(card);
      },
      async updateCard(id, patch, expectedVersion) {
        const card = findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.');
        const viewer = viewerOf(card.campaign_id);
        assert(canEditAssets(viewer), '이 자료를 수정할 권한이 없습니다.');
        if (expectedVersion !== undefined && expectedVersion !== card.version) {
          throw new AppError('다른 사용자가 먼저 내용을 수정했습니다. 변경 사항을 비교해 주세요.', 'conflict');
        }
        const { tag_ids: tagIds, stats, sections, ...rest } = patch;
        Object.assign(card, rest, { updated_at: nowISO(), version: card.version + 1 });
        if (tagIds) {
          const data = db();
          data.cardTags = data.cardTags.filter((ct) => ct.card_id !== id);
          for (const tagId of tagIds) data.cardTags.push({ card_id: id, tag_id: tagId });
        }
        if (stats) {
          const index = db().monsterStats.findIndex((s) => s.card_id === id);
          const merged = { ...defaultMonsterStats(id), ...stats, card_id: id };
          if (index >= 0) db().monsterStats[index] = merged;
          else db().monsterStats.push(merged);
        }
        if (sections) {
          const data = db();
          data.sections = data.sections.filter((s) => s.card_id !== id);
          sections.forEach((section, index) => {
            data.sections.push({ ...section, id: uid(), card_id: id, sort_order: index });
          });
        }
        localStore.commit(makeEvent('cards', 'UPDATE', card as unknown as Record<string, unknown>));
        return hydrateCard(card);
      },
      async duplicateCard(id) {
        const source = hydrateCard(findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.'));
        const viewer = viewerOf(source.campaign_id);
        assert(canEditAssets(viewer), '카드를 복제할 권한이 없습니다.');
        const clone: Card = {
          ...source,
          id: uid(),
          name: `${source.name} (사본)`,
          reveal_scope: 'hidden',
          reveal_targets: [],
          is_temporary_reveal: false,
          version: 1,
          created_at: nowISO(),
          updated_at: nowISO(),
        };
        db().cards.push(clone);
        for (const tagId of source.tag_ids ?? []) db().cardTags.push({ card_id: clone.id, tag_id: tagId });
        for (const section of source.sections ?? []) db().sections.push({ ...section, id: uid(), card_id: clone.id });
        if (source.stats) db().monsterStats.push({ ...source.stats, card_id: clone.id });
        localStore.commit(makeEvent('cards', 'INSERT', clone as unknown as Record<string, unknown>));
        return hydrateCard(clone);
      },
      async deleteCard(id) {
        const card = findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.');
        const viewer = viewerOf(card.campaign_id);
        assert(canEditAssets(viewer), '이 자료를 삭제할 권한이 없습니다.');
        card.deleted_at = nowISO();
        card.reveal_scope = 'hidden';
        trash(card.campaign_id, 'card', card.id, card.name, card);
        localStore.commit(makeEvent('cards', 'UPDATE', card as unknown as Record<string, unknown>));
      },
      async restoreCard(id) {
        const card = findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(card.campaign_id)), '카드를 복구할 권한이 없습니다.');
        card.deleted_at = null;
        const data = db();
        data.deletedItems = data.deletedItems.filter((d) => d.entity_id !== id);
        localStore.commit(makeEvent('cards', 'UPDATE', card as unknown as Record<string, unknown>));
      },
      async setReveal(id, input: RevealInput) {
        const card = findOrThrow(db().cards, (c) => c.id === id, '카드를 찾을 수 없습니다.');
        const viewer = viewerOf(card.campaign_id);
        assert(canEditAssets(viewer), '공개 범위를 변경할 권한이 없습니다.');
        const before = {
          reveal_scope: card.reveal_scope,
          reveal_fields: card.reveal_fields,
          reveal_targets: card.reveal_targets,
        };
        if (input.temporary && !card.is_temporary_reveal) card.previous_scope = card.reveal_scope;
        card.reveal_scope = input.scope;
        if (input.fields) card.reveal_fields = input.fields;
        card.reveal_targets = input.targets ?? [];
        card.is_temporary_reveal = input.temporary === true;
        card.updated_at = nowISO();
        card.version += 1;
        localStore.commit(makeEvent('cards', 'UPDATE', card as unknown as Record<string, unknown>));

        if (input.sessionId) {
          pushLog(input.sessionId, {
            event_type: 'card.reveal',
            target_type: 'card',
            target_id: card.id,
            target_name: card.name,
            before,
            after: { reveal_scope: card.reveal_scope },
            message:
              input.scope === 'hidden'
                ? `"${card.name}" 카드를 비공개로 되돌렸습니다.`
                : `"${card.name}" 카드를 공개했습니다.`,
            visibility: 'all',
          });
        }
        if (input.scope !== 'hidden') {
          const targets = input.targets && input.targets.length > 0 ? input.targets : playerIdsOf(card.campaign_id);
          notify(targets, {
            campaign_id: card.campaign_id,
            session_id: input.sessionId ?? null,
            type: card.type === 'handout' ? 'handout_revealed' : 'card_revealed',
            title: card.type === 'handout' ? '새 핸드아웃' : '새 자료 공개',
            body: `"${card.name}"이(가) 공개되었습니다.`,
            data: { card_id: card.id },
          });
        }
        pushAudit(card.campaign_id, 'card.reveal_scope_change', { card_id: card.id, before, after: card.reveal_scope });
        return hydrateCard(card);
      },
      async bulkUpdate(ids, patch) {
        if (ids.length === 0) return;
        const first = db().cards.find((c) => c.id === ids[0]);
        if (!first) throw new AppError('카드를 찾을 수 없습니다.', 'not_found');
        assert(canEditAssets(viewerOf(first.campaign_id)), '자료를 수정할 권한이 없습니다.');
        for (const id of ids) {
          const card = db().cards.find((c) => c.id === id);
          if (!card) continue;
          if (patch.folder_id !== undefined) card.folder_id = patch.folder_id;
          if (patch.reveal_scope !== undefined) card.reveal_scope = patch.reveal_scope;
          if (patch.is_archived !== undefined) card.is_archived = patch.is_archived;
          card.updated_at = nowISO();
          card.version += 1;
          for (const tagId of patch.add_tags ?? []) {
            if (!db().cardTags.some((ct) => ct.card_id === id && ct.tag_id === tagId)) {
              db().cardTags.push({ card_id: id, tag_id: tagId });
            }
          }
          if (patch.remove_tags?.length) {
            const data = db();
            data.cardTags = data.cardTags.filter((ct) => !(ct.card_id === id && patch.remove_tags?.includes(ct.tag_id)));
          }
        }
        localStore.commit(makeEvent('cards', 'UPDATE', null));
      },
      async setSections(cardId, sections) {
        const card = findOrThrow(db().cards, (c) => c.id === cardId, '카드를 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(card.campaign_id)), '자료를 수정할 권한이 없습니다.');
        const data = db();
        data.sections = data.sections.filter((s) => s.card_id !== cardId);
        const created: CardSection[] = sections.map((section, index) => ({
          ...section,
          id: uid(),
          card_id: cardId,
          sort_order: index,
        }));
        data.sections.push(...created);
        card.updated_at = nowISO();
        localStore.commit(makeEvent('card_sections', 'UPDATE', { card_id: cardId }));
        return created;
      },
      async setStats(cardId, stats) {
        const card = findOrThrow(db().cards, (c) => c.id === cardId, '카드를 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(card.campaign_id)), '자료를 수정할 권한이 없습니다.');
        const merged: MonsterStats = { ...defaultMonsterStats(cardId), ...stats, card_id: cardId };
        const index = db().monsterStats.findIndex((s) => s.card_id === cardId);
        if (index >= 0) db().monsterStats[index] = merged;
        else db().monsterStats.push(merged);
        card.updated_at = nowISO();
        localStore.commit(makeEvent('monster_stats', 'UPDATE', merged as unknown as Record<string, unknown>));
        return merged;
      },
      async templates(campaignId) {
        viewerOf(campaignId);
        const custom = db().templates.filter((t) => t.campaign_id === campaignId);
        const system: CardTemplate[] = SYSTEM_TEMPLATES.map((t) => ({ ...t, campaign_id: null }));
        return [...system, ...custom];
      },
      async saveTemplate(campaignId, template) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '템플릿을 저장할 권한이 없습니다.');
        const record: CardTemplate = { ...template, id: uid(), campaign_id: campaignId, is_system: false };
        db().templates.push(record);
        localStore.commit(makeEvent('card_templates', 'INSERT', record as unknown as Record<string, unknown>));
        return record;
      },
      async deleteTemplate(id) {
        const template = findOrThrow(db().templates, (t) => t.id === id, '템플릿을 찾을 수 없습니다.');
        assert(!template.is_system, '기본 템플릿은 삭제할 수 없습니다.');
        if (template.campaign_id) assert(canEditAssets(viewerOf(template.campaign_id)), '템플릿을 삭제할 권한이 없습니다.');
        const data = db();
        data.templates = data.templates.filter((t) => t.id !== id);
        localStore.commit(makeEvent('card_templates', 'DELETE', null, { id }));
      },
    },

    characters: {
      async list(campaignId) {
        viewerOf(campaignId);
        return db().characters.filter((c) => c.campaign_id === campaignId);
      },
      async get(id) {
        const character = findOrThrow(db().characters, (c) => c.id === id, '캐릭터를 찾을 수 없습니다.');
        viewerOf(character.campaign_id);
        return character;
      },
      async create(campaignId, input) {
        const viewer = viewerOf(campaignId);
        const targetUser = input.user_id && isDM(viewer) ? input.user_id : viewer.userId;
        const character: PlayerCharacter = {
          ...defaultCharacter(campaignId, targetUser, input.name?.trim() || '새 캐릭터'),
          ...input,
          id: uid(),
          campaign_id: campaignId,
          user_id: targetUser,
          created_at: nowISO(),
          updated_at: nowISO(),
          version: 1,
        };
        db().characters.push(character);
        localStore.commit(makeEvent('player_characters', 'INSERT', character as unknown as Record<string, unknown>));
        return character;
      },
      async update(id, patch, expectedVersion) {
        const character = findOrThrow(db().characters, (c) => c.id === id, '캐릭터를 찾을 수 없습니다.');
        const viewer = viewerOf(character.campaign_id);
        assert(character.user_id === viewer.userId || isDM(viewer), '이 캐릭터를 수정할 권한이 없습니다.');
        if (expectedVersion !== undefined && expectedVersion !== character.version) {
          throw new AppError('다른 사용자가 먼저 내용을 수정했습니다. 변경 사항을 비교해 주세요.', 'conflict');
        }
        Object.assign(character, patch, { updated_at: nowISO(), version: character.version + 1 });
        localStore.commit(makeEvent('player_characters', 'UPDATE', character as unknown as Record<string, unknown>));
        return character;
      },
      async remove(id) {
        const character = findOrThrow(db().characters, (c) => c.id === id, '캐릭터를 찾을 수 없습니다.');
        const viewer = viewerOf(character.campaign_id);
        assert(character.user_id === viewer.userId || isOwner(viewer), '이 캐릭터를 삭제할 권한이 없습니다.');
        const data = db();
        data.characters = data.characters.filter((c) => c.id !== id);
        data.resources = data.resources.filter((r) => r.character_id !== id);
        localStore.commit(makeEvent('player_characters', 'DELETE', null, { id }));
      },
      async resources(characterId) {
        return db()
          .resources.filter((r) => r.character_id === characterId)
          .sort((a, b) => a.sort_order - b.sort_order);
      },
      async saveResource(characterId, resource) {
        const character = findOrThrow(db().characters, (c) => c.id === characterId, '캐릭터를 찾을 수 없습니다.');
        const viewer = viewerOf(character.campaign_id);
        assert(character.user_id === viewer.userId || isDM(viewer), '자원을 수정할 권한이 없습니다.');
        if (resource.id) {
          const existing = findOrThrow(db().resources, (r) => r.id === resource.id, '자원을 찾을 수 없습니다.');
          Object.assign(existing, resource);
          localStore.commit(makeEvent('character_resources', 'UPDATE', existing as unknown as Record<string, unknown>));
          return existing;
        }
        const created: CharacterResource = {
          id: uid(),
          character_id: characterId,
          name: resource.name ?? '새 자원',
          current: resource.current ?? 0,
          max: resource.max ?? 0,
          recharge: resource.recharge ?? 'long',
          sort_order: db().resources.filter((r) => r.character_id === characterId).length,
        };
        db().resources.push(created);
        localStore.commit(makeEvent('character_resources', 'INSERT', created as unknown as Record<string, unknown>));
        return created;
      },
      async deleteResource(id) {
        const data = db();
        data.resources = data.resources.filter((r) => r.id !== id);
        localStore.commit(makeEvent('character_resources', 'DELETE', null, { id }));
      },
      async rest(characterId, kind) {
        const character = findOrThrow(db().characters, (c) => c.id === characterId, '캐릭터를 찾을 수 없습니다.');
        const viewer = viewerOf(character.campaign_id);
        assert(character.user_id === viewer.userId || isDM(viewer), '휴식을 적용할 권한이 없습니다.');
        for (const resource of db().resources.filter((r) => r.character_id === characterId)) {
          if (resource.recharge === 'short' || (kind === 'long' && resource.recharge === 'long')) {
            resource.current = resource.max;
          }
        }
        if (kind === 'long') {
          character.hp = character.max_hp;
          character.temp_hp = 0;
          character.death_saves = { successes: 0, failures: 0 };
        }
        character.updated_at = nowISO();
        localStore.commit(makeEvent('player_characters', 'UPDATE', character as unknown as Record<string, unknown>));
      },
    },

    combat: {
      async encounters(sessionId) {
        const session = campaignOfSession(sessionId);
        viewerOf(session.campaign_id);
        return db().encounters.filter((e) => e.session_id === sessionId);
      },
      async activeEncounter(sessionId) {
        const session = campaignOfSession(sessionId);
        viewerOf(session.campaign_id);
        return db().encounters.find((e) => e.session_id === sessionId && e.status !== 'ended') ?? null;
      },
      async createEncounter(sessionId, name) {
        const session = campaignOfSession(sessionId);
        const viewer = viewerOf(session.campaign_id);
        assert(canManageCombat(viewer), '전투를 만들 권한이 없습니다.');
        const encounter: Encounter = {
          id: uid(),
          session_id: sessionId,
          campaign_id: session.campaign_id,
          name: name.trim() || '새 전투',
          status: 'draft',
          round: 0,
          active_combatant_id: null,
          turn_started_at: null,
          tiebreak_rule: 'dex_mod',
          version: 1,
          created_at: nowISO(),
        };
        db().encounters.push(encounter);
        localStore.commit(makeEvent('encounters', 'INSERT', encounter as unknown as Record<string, unknown>));
        pushLog(sessionId, { event_type: 'encounter.create', target_type: 'encounter', target_id: encounter.id, target_name: encounter.name, message: `전투 "${encounter.name}"을(를) 준비했습니다.`, visibility: 'all' });
        return encounter;
      },
      async updateEncounter(id, patch) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === id, '전투를 찾을 수 없습니다.');
        const viewer = viewerOf(encounter.campaign_id);
        assert(canManageCombat(viewer), '전투를 수정할 권한이 없습니다.');
        const wasActive = encounter.status === 'active';
        Object.assign(encounter, patch, { version: encounter.version + 1 });
        if (!wasActive && encounter.status === 'active') {
          if (encounter.round < 1) encounter.round = 1;
          if (!encounter.active_combatant_id) {
            const order = turnOrder(db().combatants.filter((c) => c.encounter_id === id), encounter.tiebreak_rule);
            encounter.active_combatant_id = order[0]?.id ?? null;
            encounter.turn_started_at = nowISO();
          }
          pushLog(encounter.session_id, { event_type: 'encounter.start', target_type: 'encounter', target_id: id, target_name: encounter.name, message: `전투 "${encounter.name}"이(가) 시작되었습니다.`, visibility: 'all' });
        }
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        return encounter;
      },
      async endEncounter(id) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === id, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '전투를 종료할 권한이 없습니다.');
        encounter.status = 'ended';
        encounter.active_combatant_id = null;
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        pushLog(encounter.session_id, { event_type: 'encounter.end', target_type: 'encounter', target_id: id, target_name: encounter.name, message: `전투 "${encounter.name}"이(가) 종료되었습니다.`, visibility: 'all' });
        return encounter;
      },
      async combatants(encounterId) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        viewerOf(encounter.campaign_id);
        return db()
          .combatants.filter((c) => c.encounter_id === encounterId)
          .map(hydrateCombatant)
          .sort((a, b) => a.sort_order - b.sort_order);
      },
      async addCombatant(encounterId, input: CombatantInput) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        const viewer = viewerOf(encounter.campaign_id);
        assert(canManageCombat(viewer), '참가자를 추가할 권한이 없습니다.');
        const count = Math.min(20, Math.max(1, input.count ?? 1));
        const created: Combatant[] = [];
        for (let i = 0; i < count; i += 1) {
          const existingNames = db()
            .combatants.filter((c) => c.encounter_id === encounterId)
            .map((c) => c.name);
          const name = count > 1 || existingNames.some((n) => n === input.name)
            ? uniqueCombatantName(input.name, existingNames)
            : input.name;
          const combatant: Combatant = {
            id: uid(),
            encounter_id: encounterId,
            source_type: input.source_type,
            source_card_id: input.source_card_id ?? null,
            character_id: input.character_id ?? null,
            name,
            image_url: input.image_url ?? null,
            initiative: input.initiative ?? null,
            initiative_tiebreak: 0,
            dex_mod: Math.floor(((input.dex_score ?? 10) - 10) / 2),
            dex_score: input.dex_score ?? 10,
            hp: input.hp,
            max_hp: input.max_hp,
            temp_hp: 0,
            ac: input.ac,
            is_hidden: input.is_hidden ?? false,
            is_defeated: false,
            is_concentrating: false,
            concentration_note: '',
            hide_hp_numbers: input.hide_hp_numbers ?? input.source_type !== 'pc',
            dm_notes: input.dm_notes ?? '',
            sort_order: db().combatants.filter((c) => c.encounter_id === encounterId).length,
          };
          db().combatants.push(combatant);
          created.push(combatant);
        }
        localStore.commit(makeEvent('encounter_combatants', 'INSERT', null));
        pushLog(encounter.session_id, {
          event_type: 'combat.add',
          target_type: 'combatant',
          target_name: input.name,
          message: `${input.name}${count > 1 ? ` ${count}체` : ''}을(를) 전투에 추가했습니다.`,
          visibility: 'all',
        });
        return created.map(hydrateCombatant);
      },
      async updateCombatant(id, patch) {
        const combatant = findOrThrow(db().combatants, (c) => c.id === id, '참가자를 찾을 수 없습니다.');
        const encounter = findOrThrow(db().encounters, (e) => e.id === combatant.encounter_id, '전투를 찾을 수 없습니다.');
        const viewer = viewerOf(encounter.campaign_id);
        const character = combatant.character_id ? db().characters.find((c) => c.id === combatant.character_id) : null;
        const ownsCharacter = character?.user_id === viewer.userId;
        assert(canManageCombat(viewer) || ownsCharacter, '이 참가자를 수정할 권한이 없습니다.');
        Object.assign(combatant, patch);
        if (patch.dex_score !== undefined) combatant.dex_mod = Math.floor((patch.dex_score - 10) / 2);
        localStore.commit(makeEvent('encounter_combatants', 'UPDATE', combatant as unknown as Record<string, unknown>));
        return hydrateCombatant(combatant);
      },
      async removeCombatant(id) {
        const combatant = findOrThrow(db().combatants, (c) => c.id === id, '참가자를 찾을 수 없습니다.');
        const encounter = findOrThrow(db().encounters, (e) => e.id === combatant.encounter_id, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '참가자를 제거할 권한이 없습니다.');
        const data = db();
        if (encounter.active_combatant_id === id) {
          const order = turnOrder(data.combatants.filter((c) => c.encounter_id === encounter.id && c.id !== id), encounter.tiebreak_rule);
          encounter.active_combatant_id = order[0]?.id ?? null;
        }
        data.combatants = data.combatants.filter((c) => c.id !== id);
        data.conditions = data.conditions.filter((c) => c.combatant_id !== id);
        localStore.commit(makeEvent('encounter_combatants', 'DELETE', null, { id }));
        pushLog(encounter.session_id, { event_type: 'combat.remove', target_type: 'combatant', target_id: id, target_name: combatant.name, message: `${combatant.name}을(를) 전투에서 제거했습니다.`, visibility: 'all' });
      },
      async applyHp(encounterId, inputs: DamageInput[]) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        const viewer = viewerOf(encounter.campaign_id);
        const updated: Combatant[] = [];

        for (const input of inputs) {
          const combatant = db().combatants.find((c) => c.id === input.combatantId);
          if (!combatant) continue;
          const character = combatant.character_id ? db().characters.find((c) => c.id === combatant.character_id) : null;
          const ownsCharacter = character?.user_id === viewer.userId;
          assert(canManageCombat(viewer) || ownsCharacter, 'HP를 변경할 권한이 없습니다.');

          const before = { hp: combatant.hp, max_hp: combatant.max_hp, temp_hp: combatant.temp_hp, is_defeated: combatant.is_defeated };
          const state = { hp: combatant.hp, maxHp: combatant.max_hp, tempHp: combatant.temp_hp };
          let message = '';

          switch (input.kind) {
            case 'damage': {
              const result = applyDamage(state, input.amount);
              combatant.hp = result.hp;
              combatant.temp_hp = result.tempHp;
              message = `${combatant.name}이(가) ${input.amount} 피해를 입었습니다.`;
              if (result.droppedToZero) {
                combatant.is_defeated = true;
                combatant.is_concentrating = false;
                const targets = character ? [character.user_id] : [];
                notify(targets, {
                  campaign_id: encounter.campaign_id,
                  session_id: encounter.session_id,
                  type: 'hp_zero',
                  title: 'HP 0',
                  body: `${combatant.name}의 HP가 0이 되었습니다.`,
                  data: { combatant_id: combatant.id },
                });
              }
              break;
            }
            case 'heal': {
              const result = applyHealing(state, input.amount);
              combatant.hp = result.hp;
              if (result.hp > 0) combatant.is_defeated = false;
              message = `${combatant.name}이(가) ${input.amount} 회복했습니다.`;
              break;
            }
            case 'temp': {
              const result = setTempHp(state, input.amount);
              combatant.temp_hp = result.tempHp;
              message = `${combatant.name}에게 임시 HP ${input.amount}을(를) 부여했습니다.`;
              break;
            }
            case 'set_hp': {
              const clamped = Math.max(0, Math.min(combatant.max_hp, Math.floor(input.amount)));
              combatant.hp = clamped;
              combatant.is_defeated = clamped <= 0;
              message = `${combatant.name}의 HP를 ${clamped}(으)로 설정했습니다.`;
              break;
            }
            case 'set_max_hp': {
              const result = setMaxHp(state, input.amount);
              combatant.hp = result.hp;
              combatant.max_hp = result.maxHp;
              message = `${combatant.name}의 최대 HP를 ${result.maxHp}(으)로 설정했습니다.`;
              break;
            }
          }

          // 캐릭터 시트와 양방향 동기화
          if (character) {
            character.hp = combatant.hp;
            character.temp_hp = combatant.temp_hp;
            character.max_hp = combatant.max_hp;
            character.updated_at = nowISO();
          }
          updated.push(combatant);
          pushLog(encounter.session_id, {
            event_type: 'combat.hp',
            target_type: 'combatant',
            target_id: combatant.id,
            target_name: combatant.name,
            before,
            after: { hp: combatant.hp, max_hp: combatant.max_hp, temp_hp: combatant.temp_hp, is_defeated: combatant.is_defeated },
            message,
            visibility: 'all',
          });
        }
        localStore.commit(makeEvent('encounter_combatants', 'UPDATE', null));
        return updated.map(hydrateCombatant);
      },
      async nextTurn(encounterId) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '턴을 진행할 권한이 없습니다.');
        const order = turnOrder(db().combatants.filter((c) => c.encounter_id === encounterId), encounter.tiebreak_rule);
        const state = nextTurn(order, { round: encounter.round, activeCombatantId: encounter.active_combatant_id });
        const roundChanged = state.round !== encounter.round;
        encounter.round = state.round;
        encounter.active_combatant_id = state.activeCombatantId;
        encounter.turn_started_at = nowISO();
        encounter.version += 1;

        const active = db().combatants.find((c) => c.id === state.activeCombatantId);
        if (active) {
          pushLog(encounter.session_id, {
            event_type: 'combat.turn',
            target_type: 'combatant',
            target_id: active.id,
            target_name: active.name,
            message: `${active.name}의 차례입니다.${roundChanged ? ` (라운드 ${state.round})` : ''}`,
            visibility: 'all',
          });
          const character = active.character_id ? db().characters.find((c) => c.id === active.character_id) : null;
          if (character) {
            notify([character.user_id], {
              campaign_id: encounter.campaign_id,
              session_id: encounter.session_id,
              type: 'turn_started',
              title: '내 차례',
              body: `${active.name}의 차례입니다.`,
              data: { combatant_id: active.id },
            });
          }
        }
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        return encounter;
      },
      async previousTurn(encounterId) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '턴을 진행할 권한이 없습니다.');
        const order = turnOrder(db().combatants.filter((c) => c.encounter_id === encounterId), encounter.tiebreak_rule);
        const state = previousTurn(order, { round: encounter.round, activeCombatantId: encounter.active_combatant_id });
        encounter.round = state.round;
        encounter.active_combatant_id = state.activeCombatantId;
        encounter.version += 1;
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        return encounter;
      },
      async setActive(encounterId, combatantId) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '턴을 변경할 권한이 없습니다.');
        encounter.active_combatant_id = combatantId;
        encounter.turn_started_at = nowISO();
        encounter.version += 1;
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        return encounter;
      },
      async setRound(encounterId, round) {
        const encounter = findOrThrow(db().encounters, (e) => e.id === encounterId, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '라운드를 변경할 권한이 없습니다.');
        encounter.round = Math.max(0, Math.floor(round));
        encounter.version += 1;
        localStore.commit(makeEvent('encounters', 'UPDATE', encounter as unknown as Record<string, unknown>));
        return encounter;
      },
      async addCondition(combatantId, input: ConditionInput) {
        const combatant = findOrThrow(db().combatants, (c) => c.id === combatantId, '참가자를 찾을 수 없습니다.');
        const encounter = findOrThrow(db().encounters, (e) => e.id === combatant.encounter_id, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '상태 효과를 적용할 권한이 없습니다.');
        const template = CONDITION_MAP.get(input.condition_key);

        // 이미 걸린 상태를 다시 적용하면 새로 만들지 않고 스택을 올린다.
        const existing = db().conditions.find(
          (c) => c.combatant_id === combatantId && c.condition_key === input.condition_key,
        );
        if (existing) {
          existing.stacks = Math.min(999, existing.stacks + (input.stacks ?? 1));
          localStore.commit(makeEvent('combatant_conditions', 'UPDATE', existing as unknown as Record<string, unknown>));
          return snapshot(existing);
        }

        const condition: CombatantCondition = {
          id: uid(),
          combatant_id: combatantId,
          condition_key: input.condition_key,
          custom_name: input.custom_name ?? template?.name ?? input.condition_key,
          icon: input.icon ?? template?.icon ?? 'circle',
          description: input.description ?? template?.description ?? '',
          started_round: Math.max(1, encounter.round),
          duration_mode: input.duration_mode,
          duration_rounds: input.duration_rounds ?? null,
          source_combatant_id: input.source_combatant_id ?? null,
          linked_concentration: input.linked_concentration ?? false,
          is_public: input.is_public ?? true,
          stacks: Math.max(1, Math.min(999, input.stacks ?? 1)),
          created_at: nowISO(),
        };
        db().conditions.push(condition);
        localStore.commit(makeEvent('combatant_conditions', 'INSERT', condition as unknown as Record<string, unknown>));
        pushLog(encounter.session_id, {
          event_type: 'condition.apply',
          target_type: 'combatant',
          target_id: combatantId,
          target_name: combatant.name,
          after: { condition: condition.custom_name },
          message: `${combatant.name}에게 "${condition.custom_name}" 상태를 적용했습니다.`,
          visibility: condition.is_public ? 'all' : 'dm',
        });
        const character = combatant.character_id ? db().characters.find((c) => c.id === combatant.character_id) : null;
        if (character && condition.is_public) {
          notify([character.user_id], {
            campaign_id: encounter.campaign_id,
            session_id: encounter.session_id,
            type: 'condition_applied',
            title: '상태 효과',
            body: `${combatant.name}에게 "${condition.custom_name}" 상태가 적용되었습니다.`,
            data: { condition_id: condition.id },
          });
        }
        return condition;
      },
      async removeCondition(id) {
        const condition = findOrThrow(db().conditions, (c) => c.id === id, '상태 효과를 찾을 수 없습니다.');
        const combatant = db().combatants.find((c) => c.id === condition.combatant_id);
        const encounter = combatant ? db().encounters.find((e) => e.id === combatant.encounter_id) : null;
        if (encounter) assert(canManageCombat(viewerOf(encounter.campaign_id)), '상태 효과를 해제할 권한이 없습니다.');
        const data = db();
        data.conditions = data.conditions.filter((c) => c.id !== id);
        localStore.commit(makeEvent('combatant_conditions', 'DELETE', null, { id }));
        if (encounter && combatant) {
          pushLog(encounter.session_id, {
            event_type: 'condition.expire',
            target_type: 'combatant',
            target_id: combatant.id,
            target_name: combatant.name,
            message: `${combatant.name}의 "${condition.custom_name}" 상태가 종료되었습니다.`,
            visibility: condition.is_public ? 'all' : 'dm',
          });
        }
      },
      async setConditionStacks(id, stacks) {
        const condition = findOrThrow(db().conditions, (c) => c.id === id, '상태 효과를 찾을 수 없습니다.');
        const combatant = db().combatants.find((c) => c.id === condition.combatant_id);
        const encounter = combatant ? db().encounters.find((e) => e.id === combatant.encounter_id) : null;
        if (encounter) assert(canManageCombat(viewerOf(encounter.campaign_id)), '상태 효과를 변경할 권한이 없습니다.');

        const next = Math.min(999, Math.round(stacks));
        if (next <= 0) {
          const data = db();
          data.conditions = data.conditions.filter((c) => c.id !== id);
          localStore.commit(makeEvent('combatant_conditions', 'DELETE', null, { id }));
          if (encounter && combatant) {
            pushLog(encounter.session_id, {
              event_type: 'condition.expire',
              target_type: 'combatant',
              target_id: combatant.id,
              target_name: combatant.name,
              message: `${combatant.name}의 "${condition.custom_name}" 상태가 종료되었습니다.`,
              visibility: condition.is_public ? 'all' : 'dm',
            });
          }
          return null;
        }

        const before = condition.stacks;
        condition.stacks = next;
        localStore.commit(makeEvent('combatant_conditions', 'UPDATE', condition as unknown as Record<string, unknown>));
        if (encounter && combatant) {
          pushLog(encounter.session_id, {
            event_type: 'condition.stacks',
            target_type: 'combatant',
            target_id: combatant.id,
            target_name: combatant.name,
            message: `${combatant.name}의 "${condition.custom_name}" ${before} → ${next}`,
            visibility: condition.is_public ? 'all' : 'dm',
          });
        }
        return snapshot(condition);
      },

      async conditionLibrary(campaignId) {
        viewerOf(campaignId);
        const custom = db().conditionLibrary.filter((c) => c.campaign_id === campaignId);
        const system: Condition[] = DND5E_CONDITIONS.map((template, index) => ({
          id: `system:${template.key}`,
          campaign_id: null,
          key: template.key,
          name: template.name,
          icon: template.icon,
          description: [template.description, ...template.details].join('\n'),
          is_stackable: template.isStackable ?? false,
          color: null,
          sort_order: index,
        }));
        return snapshot([...system, ...custom.sort((a, b) => a.sort_order - b.sort_order)]);
      },

      async saveConditionTemplate(campaignId, input) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '상태 효과를 편집할 권한이 없습니다.');

        const name = input.name.trim();
        assert(name.length > 0, '상태 이름을 입력해 주세요.', 'validation');

        const data = db();
        if (input.id) {
          const existing = findOrThrow(data.conditionLibrary, (c) => c.id === input.id, '상태 효과를 찾을 수 없습니다.');
          assert(existing.campaign_id === campaignId, '다른 캠페인의 상태는 수정할 수 없습니다.');
          Object.assign(existing, {
            name,
            icon: input.icon ?? existing.icon,
            description: input.description ?? existing.description,
            is_stackable: input.is_stackable ?? existing.is_stackable,
            color: input.color === undefined ? existing.color : input.color,
            sort_order: input.sort_order ?? existing.sort_order,
          });
          localStore.commit(makeEvent('conditions', 'UPDATE', existing as unknown as Record<string, unknown>));
          pushAudit(campaignId, 'condition.update', { name });
          return snapshot(existing);
        }

        const key = (input.key ?? name).trim().toLowerCase().replace(/\s+/g, '-');
        assert(
          !data.conditionLibrary.some((c) => c.campaign_id === campaignId && c.key === key),
          '같은 이름의 상태가 이미 있습니다.',
          'conflict',
        );

        const created: Condition = {
          id: uid(),
          campaign_id: campaignId,
          key,
          name,
          icon: input.icon ?? 'sparkles',
          description: input.description ?? '',
          is_stackable: input.is_stackable ?? false,
          color: input.color ?? null,
          sort_order: input.sort_order ?? data.conditionLibrary.filter((c) => c.campaign_id === campaignId).length,
        };
        data.conditionLibrary.push(created);
        localStore.commit(makeEvent('conditions', 'INSERT', created as unknown as Record<string, unknown>));
        pushAudit(campaignId, 'condition.create', { name });
        return snapshot(created);
      },

      async deleteConditionTemplate(id) {
        const data = db();
        const existing = findOrThrow(data.conditionLibrary, (c) => c.id === id, '상태 효과를 찾을 수 없습니다.');
        const campaignId = existing.campaign_id;
        assert(campaignId !== null, '시스템 기본 상태는 삭제할 수 없습니다.');
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '상태 효과를 삭제할 권한이 없습니다.');
        data.conditionLibrary = data.conditionLibrary.filter((c) => c.id !== id);
        localStore.commit(makeEvent('conditions', 'DELETE', null, { id }));
        pushAudit(campaignId, 'condition.delete', { name: existing.name });
      },

      async setConcentration(combatantId, on, note) {
        const combatant = findOrThrow(db().combatants, (c) => c.id === combatantId, '참가자를 찾을 수 없습니다.');
        const encounter = findOrThrow(db().encounters, (e) => e.id === combatant.encounter_id, '전투를 찾을 수 없습니다.');
        assert(canManageCombat(viewerOf(encounter.campaign_id)), '집중 상태를 변경할 권한이 없습니다.');
        combatant.is_concentrating = on;
        combatant.concentration_note = on ? (note ?? '') : '';
        if (!on) {
          const data = db();
          data.conditions = data.conditions.filter((c) => !(c.combatant_id === combatantId && c.linked_concentration));
        }
        localStore.commit(makeEvent('encounter_combatants', 'UPDATE', combatant as unknown as Record<string, unknown>));
        return hydrateCombatant(combatant);
      },
    },

    timers: {
      async list(sessionId) {
        const session = campaignOfSession(sessionId);
        const viewer = viewerOf(session.campaign_id);
        const dm = isDM(viewer);
        return db().timers.filter((t) => t.session_id === sessionId && (dm || t.is_shared));
      },
      async create(sessionId, input) {
        const session = campaignOfSession(sessionId);
        const viewer = viewerOf(session.campaign_id);
        assert(canManageCombat(viewer) || isDM(viewer), '타이머를 만들 권한이 없습니다.');
        const timer: Timer = {
          id: uid(),
          session_id: sessionId,
          name: input.name?.trim() || '새 타이머',
          description: input.description ?? '',
          kind: input.kind ?? 'countdown',
          duration_seconds: input.duration_seconds ?? 60,
          ends_at: null,
          started_at: null,
          paused_remaining_ms: null,
          elapsed_ms: 0,
          state: 'idle',
          is_shared: input.is_shared ?? true,
          end_message: input.end_message ?? '',
          sound_on_end: input.sound_on_end ?? false,
          created_by: viewer.userId,
          created_at: nowISO(),
        };
        db().timers.push(timer);
        localStore.commit(makeEvent('timers', 'INSERT', timer as unknown as Record<string, unknown>));
        return timer;
      },
      async update(id, patch) {
        const timer = findOrThrow(db().timers, (t) => t.id === id, '타이머를 찾을 수 없습니다.');
        const session = campaignOfSession(timer.session_id);
        const viewer = viewerOf(session.campaign_id);
        assert(isDM(viewer), '타이머를 조작할 권한이 없습니다.');
        const wasRunning = timer.state === 'running';
        Object.assign(timer, patch);
        localStore.commit(makeEvent('timers', 'UPDATE', timer as unknown as Record<string, unknown>));
        if (patch.state === 'running' && !wasRunning) {
          pushLog(timer.session_id, { event_type: 'timer.start', target_type: 'timer', target_id: timer.id, target_name: timer.name, message: `타이머 "${timer.name}"을(를) 시작했습니다.`, visibility: timer.is_shared ? 'all' : 'dm' });
        }
        if (patch.state === 'finished') {
          pushLog(timer.session_id, { event_type: 'timer.end', target_type: 'timer', target_id: timer.id, target_name: timer.name, message: `타이머 "${timer.name}"이(가) 종료되었습니다.`, visibility: timer.is_shared ? 'all' : 'dm' });
          if (timer.is_shared) {
            notify(playerIdsOf(session.campaign_id), {
              campaign_id: session.campaign_id,
              session_id: session.id,
              type: 'timer_finished',
              title: '타이머 종료',
              body: timer.end_message || `"${timer.name}" 타이머가 끝났습니다.`,
              data: { timer_id: timer.id },
            });
          }
        }
        return timer;
      },
      async remove(id) {
        const timer = findOrThrow(db().timers, (t) => t.id === id, '타이머를 찾을 수 없습니다.');
        const session = campaignOfSession(timer.session_id);
        assert(isDM(viewerOf(session.campaign_id)), '타이머를 삭제할 권한이 없습니다.');
        const data = db();
        data.timers = data.timers.filter((t) => t.id !== id);
        localStore.commit(makeEvent('timers', 'DELETE', null, { id }));
      },
    },

    dice: {
      async list(sessionId, limit = 50) {
        const session = campaignOfSession(sessionId);
        const viewer = viewerOf(session.campaign_id);
        const dm = isDM(viewer);
        return db()
          .diceRolls.filter((roll) => roll.session_id === sessionId)
          .filter((roll) => {
            if (roll.visibility === 'all') return true;
            if (roll.user_id === viewer.userId) return roll.visibility !== 'dm_secret' || dm;
            if (roll.visibility === 'dm') return dm;
            return false;
          })
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit);
      },
      async roll(input) {
        const viewer = viewerOf(input.campaignId);
        assert(viewer.role !== 'spectator', '관전자는 주사위를 굴릴 수 없습니다.');
        const result = rollExpression(input.expression);
        const roll: DiceRoll = {
          id: uid(),
          session_id: input.sessionId,
          campaign_id: input.campaignId,
          user_id: viewer.userId,
          user_name: displayNameOf(viewer.userId),
          expression: result.expression,
          detail: result.detail,
          total: result.total,
          purpose: input.purpose ?? '',
          visibility: input.visibility as DiceVisibility,
          created_at: nowISO(),
        };
        db().diceRolls.push(roll);
        localStore.commit(makeEvent('dice_rolls', 'INSERT', roll as unknown as Record<string, unknown>));
        if (input.sessionId) {
          pushLog(input.sessionId, {
            event_type: 'dice.roll',
            target_type: 'dice',
            target_id: roll.id,
            target_name: roll.expression,
            after: { total: roll.total },
            message: `${roll.user_name}: ${roll.expression} → ${roll.total}${roll.purpose ? ` (${roll.purpose})` : ''}`,
            visibility: roll.visibility === 'all' ? 'all' : 'dm',
          });
        }
        return roll;
      },
    },

    notifications: {
      async list() {
        const userId = requireUserId();
        return db()
          .notifications.filter((n) => n.user_id === userId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 100);
      },
      async markRead(ids) {
        const userId = requireUserId();
        for (const notification of db().notifications) {
          if (notification.user_id === userId && ids.includes(notification.id)) {
            notification.read_at = nowISO();
          }
        }
        localStore.persist();
      },
      async markAllRead() {
        const userId = requireUserId();
        for (const notification of db().notifications) {
          if (notification.user_id === userId) notification.read_at = notification.read_at ?? nowISO();
        }
        localStore.persist();
      },
    },

    files: {
      async upload(campaignId, file, onProgress) {
        const viewer = viewerOf(campaignId);
        assert(canEditAssets(viewer), '파일을 업로드할 권한이 없습니다.');
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new AppError('파일을 읽지 못했습니다.', 'unknown'));
          reader.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
          };
          reader.readAsDataURL(file);
        });
        onProgress?.(100);
        const record: UploadedFile = {
          id: uid(),
          campaign_id: campaignId,
          owner_id: viewer.userId,
          bucket: 'local',
          path: `${campaignId}/${uid()}`,
          url: dataUrl,
          mime_type: file.type,
          size_bytes: file.size,
          width: null,
          height: null,
          thumb_url: dataUrl,
          original_name: file.name,
          created_at: nowISO(),
        };
        db().files.push(record);
        localStore.commit(makeEvent('uploaded_files', 'INSERT', record as unknown as Record<string, unknown>));
        return record;
      },
      async list(campaignId) {
        viewerOf(campaignId);
        return db().files.filter((f) => f.campaign_id === campaignId);
      },
      async remove(id) {
        const file = findOrThrow(db().files, (f) => f.id === id, '파일을 찾을 수 없습니다.');
        assert(canEditAssets(viewerOf(file.campaign_id)), '파일을 삭제할 권한이 없습니다.');
        const data = db();
        data.files = data.files.filter((f) => f.id !== id);
        localStore.commit(makeEvent('uploaded_files', 'DELETE', null, { id }));
      },
    },

    ai: {
      async generateMonster(campaignId, input: MonsterPromptInput): Promise<GeneratedMonster> {
        const viewer = viewerOf(campaignId);
        assert(isOwner(viewer) || viewer.permissions.use_ai === true, 'AI 생성 기능을 사용할 권한이 없습니다.');
        // 데모 모드에서는 외부 API를 호출하지 않고 결정적인 초안을 만든다.
        const cr = input.target_cr ?? '3';
        const crValue = Number(cr.includes('/') ? 0.5 : cr) || 3;
        const draft = {
          name: input.prompt.slice(0, 24).trim() || '이름 없는 존재',
          size: input.size ?? '중형',
          type: input.type ?? '괴물류',
          alignment: '중립 악',
          description: `${input.prompt.slice(0, 300)} (데모 모드에서 생성된 초안입니다. 실제 AI 생성은 Supabase Edge Function을 통해 동작합니다.)`,
          cr,
          ac: 12 + Math.floor(crValue / 2),
          ac_note: '천연 갑옷',
          hp: Math.max(10, Math.round(crValue * 22)),
          hit_dice: '',
          speeds: { walk: 30, fly: 0, swim: 0, climb: 0, burrow: 0 },
          abilities: {
            str: 10 + Math.min(8, Math.round(crValue)),
            dex: 12,
            con: 10 + Math.min(8, Math.round(crValue)),
            int: 8,
            wis: 11,
            cha: 9,
          },
          saves: {},
          skills: {},
          vulnerabilities: [],
          resistances: input.damage_types ?? [],
          immunities: [],
          condition_immunities: [],
          senses: '암시야 60피트',
          languages: '공용어',
          traits: [{ name: '특성 초안', description: input.gimmick ?? '특수 기믹을 여기에 작성하세요.' }],
          actions: [
            {
              name: '근접 공격',
              description: `명중 +${4 + Math.floor(crValue / 4)}, 사거리 5피트. 명중 시 ${Math.max(4, Math.round(crValue * 3))} 피해.`,
            },
          ],
          bonus_actions: [],
          reactions: [],
          legendary_actions: [],
          tactics: input.tactics ?? '전투 운영 지침을 작성하세요.',
        };
        return generatedMonsterSchema.parse(draft);
      },
    },

    realtime: {
      subscribeSession(_sessionId, handler: RealtimeHandler) {
        return localStore.subscribe(handler);
      },
      subscribeCampaign(_campaignId, handler: RealtimeHandler) {
        return localStore.subscribe(handler);
      },
      subscribeUser(_userId, handler: RealtimeHandler) {
        return localStore.subscribe(handler);
      },
      onStatusChange(cb) {
        statusListeners.add(cb);
        cb('connected');
        return () => statusListeners.delete(cb);
      },
      status() {
        return 'connected';
      },
    },
  };

  return {
    mode: repository.mode,
    auth: withSnapshots(repository.auth),
    campaigns: withSnapshots(repository.campaigns),
    sessions: withSnapshots(repository.sessions),
    library: withSnapshots(repository.library),
    characters: withSnapshots(repository.characters),
    combat: withSnapshots(repository.combat),
    timers: withSnapshots(repository.timers),
    dice: withSnapshots(repository.dice),
    notifications: withSnapshots(repository.notifications),
    files: withSnapshots(repository.files),
    ai: withSnapshots(repository.ai),
    // 실시간 구독은 해제 함수를 반환하므로 복사하지 않는다.
    realtime: repository.realtime,
  };
}

/** 검색 인덱스용 텍스트(데모 모드 디버깅에 사용) */
export function cardSearchText(card: Card): string {
  return `${card.name} ${card.summary} ${docToPlainText(card.body)}`;
}

export type { RevealScope, Permissions, CampaignRole, Encounter, Folder, Timer };
