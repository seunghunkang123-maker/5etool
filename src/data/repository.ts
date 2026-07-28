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
  DiceRoll,
  DiceVisibility,
  Encounter,
  Folder,
  GameSession,
  MonsterStats,
  PlayerCharacter,
  Permissions,
  Profile,
  RevealScope,
  RevealableField,
  SessionLog,
  SessionParticipant,
  Tag,
  Timer,
  UUID,
  UploadedFile,
  UserPreferences,
  DeletedItem,
} from './types';
import type { CardFilter } from '@/domain/search';
import type { VisibleCard } from '@/domain/reveal';
import type { GeneratedMonster, MonsterPromptInput } from '@/domain/monsterSchema';

/**
 * 데이터 접근 추상화.
 * UI는 이 인터페이스에만 의존한다. 구현체는 Supabase(운영)와 로컬(데모/E2E) 두 가지다.
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'conflict'
      | 'validation'
      | 'network'
      | 'rate_limit'
      | 'unknown',
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface AuthUser {
  id: UUID;
  email: string;
  email_confirmed: boolean;
}

export interface SessionState {
  user: AuthUser | null;
  profile: Profile | null;
}

export interface CampaignWithMeta extends Campaign {
  member_count: number;
  my_role: CampaignRole;
  owner_name: string;
  last_session_at: string | null;
  next_session_at: string | null;
}

export interface RealtimeEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
}

export type RealtimeHandler = (event: RealtimeEvent) => void;
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface CardInput {
  folder_id?: UUID | null;
  type: Card['type'];
  name: string;
  summary?: string;
  body?: Card['body'];
  image_url?: string | null;
  dm_notes?: string;
  tag_ids?: UUID[];
  stats?: Omit<MonsterStats, 'card_id'> | null;
  sections?: Omit<CardSection, 'id' | 'card_id'>[];
}

export interface RevealInput {
  scope: RevealScope;
  fields?: RevealableField[];
  targets?: UUID[];
  temporary?: boolean;
  sessionId?: UUID | null;
}

export interface CampaignInput {
  name: string;
  description?: string;
  system?: string;
  cover_url?: string | null;
  theme_color?: string;
  join_policy?: Campaign['join_policy'];
  max_players?: number;
  is_mature?: boolean;
}

export interface CombatantInput {
  source_type: Combatant['source_type'];
  source_card_id?: UUID | null;
  character_id?: UUID | null;
  name: string;
  image_url?: string | null;
  hp: number;
  max_hp: number;
  ac: number;
  dex_score?: number;
  initiative?: number | null;
  is_hidden?: boolean;
  hide_hp_numbers?: boolean;
  dm_notes?: string;
  count?: number;
}

export interface ConditionInput {
  condition_key: string;
  custom_name?: string | null;
  icon?: string;
  description?: string;
  duration_mode: CombatantCondition['duration_mode'];
  duration_rounds?: number | null;
  source_combatant_id?: UUID | null;
  linked_concentration?: boolean;
  is_public?: boolean;
}

export interface DamageInput {
  combatantId: UUID;
  amount: number;
  kind: 'damage' | 'heal' | 'temp' | 'set_hp' | 'set_max_hp';
}

export interface CampaignExport {
  version: 1;
  exported_at: string;
  campaign: Campaign;
  folders: Folder[];
  tags: Tag[];
  cards: Card[];
  characters: PlayerCharacter[];
  sessions: GameSession[];
}

export type ImportStrategy = 'skip' | 'overwrite' | 'duplicate';

export interface ImportPreview {
  campaignName: string;
  folders: number;
  tags: number;
  cards: number;
  conflicts: { type: string; name: string }[];
}

export interface Repository {
  readonly mode: 'supabase' | 'local';

  auth: {
    getSession(): Promise<SessionState>;
    onChange(cb: (state: SessionState) => void): () => void;
    signUp(email: string, password: string, displayName: string): Promise<SessionState>;
    signIn(email: string, password: string): Promise<SessionState>;
    signOut(): Promise<void>;
    signOutEverywhere(): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    updatePassword(newPassword: string): Promise<void>;
    resendVerification(): Promise<void>;
    updateProfile(patch: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'locale'>>): Promise<Profile>;
    deleteAccount(): Promise<void>;
    getPreferences(): Promise<UserPreferences>;
    savePreferences(patch: Partial<UserPreferences>): Promise<UserPreferences>;
  };

  campaigns: {
    list(): Promise<CampaignWithMeta[]>;
    get(id: UUID): Promise<Campaign>;
    create(input: CampaignInput): Promise<Campaign>;
    update(id: UUID, patch: Partial<Campaign>): Promise<Campaign>;
    softDelete(id: UUID): Promise<void>;
    restore(id: UUID): Promise<void>;
    duplicate(id: UUID, name: string): Promise<Campaign>;
    regenerateJoinCode(id: UUID): Promise<string>;
    joinByCode(code: string): Promise<Campaign>;
    members(id: UUID): Promise<CampaignMember[]>;
    myMembership(id: UUID): Promise<CampaignMember | null>;
    updateMember(campaignId: UUID, userId: UUID, patch: { role?: CampaignRole; permissions?: Permissions }): Promise<CampaignMember>;
    removeMember(campaignId: UUID, userId: UUID): Promise<void>;
    invite(campaignId: UUID, email: string, role: CampaignRole): Promise<CampaignInvite>;
    listInvites(campaignId: UUID): Promise<CampaignInvite[]>;
    myInvites(): Promise<CampaignInvite[]>;
    respondToInvite(inviteId: UUID, accept: boolean): Promise<void>;
    exportData(campaignId: UUID): Promise<CampaignExport>;
    previewImport(data: unknown): Promise<ImportPreview>;
    importData(campaignId: UUID | null, data: unknown, strategy: ImportStrategy): Promise<Campaign>;
    trash(campaignId: UUID): Promise<DeletedItem[]>;
    restoreItem(itemId: UUID): Promise<void>;
    purgeItem(itemId: UUID): Promise<void>;
    auditLogs(campaignId: UUID): Promise<AuditLog[]>;
  };

  sessions: {
    list(campaignId: UUID): Promise<GameSession[]>;
    get(id: UUID): Promise<GameSession>;
    create(campaignId: UUID, input: Partial<GameSession>): Promise<GameSession>;
    update(id: UUID, patch: Partial<GameSession>): Promise<GameSession>;
    start(id: UUID): Promise<GameSession>;
    end(id: UUID): Promise<GameSession>;
    remove(id: UUID): Promise<void>;
    participants(id: UUID): Promise<SessionParticipant[]>;
    join(id: UUID): Promise<void>;
    logs(id: UUID, filter?: { eventType?: string; query?: string }): Promise<SessionLog[]>;
    appendLog(id: UUID, log: Partial<SessionLog>): Promise<SessionLog>;
    undoLog(logId: UUID): Promise<void>;
    saveSummary(id: UUID, summary: GameSession['summary']): Promise<GameSession>;
    generateSummaryDraft(id: UUID): Promise<GameSession['summary']>;
  };

  library: {
    folders(campaignId: UUID): Promise<Folder[]>;
    createFolder(campaignId: UUID, input: Partial<Folder>): Promise<Folder>;
    updateFolder(id: UUID, patch: Partial<Folder>): Promise<Folder>;
    deleteFolder(id: UUID, mode: 'trash_cards' | 'move_up' | 'unfile'): Promise<void>;

    tags(campaignId: UUID): Promise<Tag[]>;
    createTag(campaignId: UUID, name: string, color: string): Promise<Tag>;
    updateTag(id: UUID, patch: Partial<Tag>): Promise<Tag>;
    deleteTag(id: UUID): Promise<void>;

    /** DM 전용: 비공개 자료를 포함한 전체 카드 */
    cards(campaignId: UUID, filter?: CardFilter): Promise<Card[]>;
    /** 플레이어/관전자용: 공개 범위가 적용된 축소 표현만 반환 */
    visibleCards(campaignId: UUID): Promise<VisibleCard[]>;
    card(id: UUID): Promise<Card>;
    createCard(campaignId: UUID, input: CardInput): Promise<Card>;
    updateCard(id: UUID, patch: Partial<Card>, expectedVersion?: number): Promise<Card>;
    duplicateCard(id: UUID): Promise<Card>;
    deleteCard(id: UUID): Promise<void>;
    restoreCard(id: UUID): Promise<void>;
    setReveal(id: UUID, input: RevealInput): Promise<Card>;
    bulkUpdate(ids: UUID[], patch: { folder_id?: UUID | null; reveal_scope?: RevealScope; is_archived?: boolean; add_tags?: UUID[]; remove_tags?: UUID[] }): Promise<void>;
    setSections(cardId: UUID, sections: Omit<CardSection, 'id' | 'card_id'>[]): Promise<CardSection[]>;
    setStats(cardId: UUID, stats: Omit<MonsterStats, 'card_id'>): Promise<MonsterStats>;
    templates(campaignId: UUID): Promise<CardTemplate[]>;
    saveTemplate(campaignId: UUID, template: Omit<CardTemplate, 'id' | 'campaign_id' | 'is_system'>): Promise<CardTemplate>;
    deleteTemplate(id: UUID): Promise<void>;
  };

  characters: {
    list(campaignId: UUID): Promise<PlayerCharacter[]>;
    get(id: UUID): Promise<PlayerCharacter>;
    create(campaignId: UUID, input: Partial<PlayerCharacter>): Promise<PlayerCharacter>;
    update(id: UUID, patch: Partial<PlayerCharacter>, expectedVersion?: number): Promise<PlayerCharacter>;
    remove(id: UUID): Promise<void>;
    resources(characterId: UUID): Promise<CharacterResource[]>;
    saveResource(characterId: UUID, resource: Partial<CharacterResource>): Promise<CharacterResource>;
    deleteResource(id: UUID): Promise<void>;
    rest(characterId: UUID, kind: 'short' | 'long'): Promise<void>;
  };

  combat: {
    encounters(sessionId: UUID): Promise<Encounter[]>;
    activeEncounter(sessionId: UUID): Promise<Encounter | null>;
    createEncounter(sessionId: UUID, name: string): Promise<Encounter>;
    updateEncounter(id: UUID, patch: Partial<Encounter>): Promise<Encounter>;
    endEncounter(id: UUID): Promise<Encounter>;
    combatants(encounterId: UUID): Promise<Combatant[]>;
    addCombatant(encounterId: UUID, input: CombatantInput): Promise<Combatant[]>;
    updateCombatant(id: UUID, patch: Partial<Combatant>): Promise<Combatant>;
    removeCombatant(id: UUID): Promise<void>;
    applyHp(encounterId: UUID, inputs: DamageInput[]): Promise<Combatant[]>;
    nextTurn(encounterId: UUID): Promise<Encounter>;
    previousTurn(encounterId: UUID): Promise<Encounter>;
    setActive(encounterId: UUID, combatantId: UUID): Promise<Encounter>;
    setRound(encounterId: UUID, round: number): Promise<Encounter>;
    addCondition(combatantId: UUID, input: ConditionInput): Promise<CombatantCondition>;
    removeCondition(id: UUID): Promise<void>;
    setConcentration(combatantId: UUID, on: boolean, note?: string): Promise<Combatant>;
  };

  timers: {
    list(sessionId: UUID): Promise<Timer[]>;
    create(sessionId: UUID, input: Partial<Timer>): Promise<Timer>;
    update(id: UUID, patch: Partial<Timer>): Promise<Timer>;
    remove(id: UUID): Promise<void>;
  };

  dice: {
    list(sessionId: UUID, limit?: number): Promise<DiceRoll[]>;
    roll(input: {
      campaignId: UUID;
      sessionId: UUID | null;
      expression: string;
      purpose?: string;
      visibility: DiceVisibility;
    }): Promise<DiceRoll>;
  };

  notifications: {
    list(): Promise<AppNotification[]>;
    markRead(ids: UUID[]): Promise<void>;
    markAllRead(): Promise<void>;
  };

  files: {
    upload(campaignId: UUID, file: File, onProgress?: (pct: number) => void): Promise<UploadedFile>;
    list(campaignId: UUID): Promise<UploadedFile[]>;
    remove(id: UUID): Promise<void>;
  };

  ai: {
    generateMonster(campaignId: UUID, input: MonsterPromptInput): Promise<GeneratedMonster>;
  };

  realtime: {
    subscribeSession(sessionId: UUID, handler: RealtimeHandler): () => void;
    subscribeCampaign(campaignId: UUID, handler: RealtimeHandler): () => void;
    subscribeUser(userId: UUID, handler: RealtimeHandler): () => void;
    onStatusChange(cb: (status: ConnectionStatus) => void): () => void;
    status(): ConnectionStatus;
  };
}
