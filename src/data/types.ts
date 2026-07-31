/**
 * 앱 전역 도메인 엔터티 타입.
 * SQL 스키마(supabase/migrations/0001_schema.sql)와 1:1로 대응한다.
 * 순수 타입만 두어 domain/ 계층이 데이터 계층에 의존하지 않게 한다.
 */

export type UUID = string;
export type ISODate = string;

// ── 역할과 권한 ────────────────────────────────────────────────
export const CAMPAIGN_ROLES = ['owner', 'co_dm', 'player', 'spectator'] as const;
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export const PERMISSION_KEYS = [
  'view_assets',
  'edit_assets',
  'manage_combat',
  'manage_players',
  'manage_session',
  'use_ai',
  'manage_campaign',
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];
export type Permissions = Partial<Record<PermissionKey, boolean>>;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_assets: '자료 열람',
  edit_assets: '자료 편집',
  manage_combat: '전투 관리',
  manage_players: '플레이어 관리',
  manage_session: '세션 설정 변경',
  use_ai: 'AI 생성 기능',
  manage_campaign: '캠페인 관리',
};

// ── 프로필 / 설정 ──────────────────────────────────────────────
export interface Profile {
  id: UUID;
  email: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
  is_admin: boolean;
  created_at: ISODate;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'default' | 'compact';

export interface NotificationPrefs {
  in_app: boolean;
  sound: boolean;
  browser: boolean;
  email: boolean;
}

export interface UserPreferences {
  user_id: UUID;
  theme: ThemeMode;
  density: Density;
  font_scale: number;
  reduce_motion: boolean;
  panel_layout: Record<string, number | boolean>;
  notification_prefs: NotificationPrefs;
}

// ── 캠페인 ────────────────────────────────────────────────────
export const CAMPAIGN_STATUSES = ['planning', 'active', 'hiatus', 'completed', 'archived'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planning: '준비 중',
  active: '진행 중',
  hiatus: '휴식 중',
  completed: '완결',
  archived: '보관됨',
};

export type JoinPolicy = 'code' | 'invite_only' | 'request';

/** 파티 상태판에서 플레이어끼리 공유할 항목 */
export interface PartyVisibility {
  hp_numbers: boolean;
  ac: boolean;
  conditions: boolean;
  concentration: boolean;
  class_level: boolean;
}

export interface Campaign {
  id: UUID;
  owner_id: UUID;
  name: string;
  description: string;
  system: string;
  cover_url: string | null;
  theme_color: string;
  status: CampaignStatus;
  join_policy: JoinPolicy;
  join_code: string;
  max_players: number;
  is_mature: boolean;
  party_visibility: PartyVisibility;
  allow_player_notes: boolean;
  deleted_at: ISODate | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface CampaignMember {
  campaign_id: UUID;
  user_id: UUID;
  role: CampaignRole;
  permissions: Permissions;
  joined_at: ISODate;
  /** 조인해서 채우는 표시용 필드 */
  profile?: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'email'>;
}

export interface CampaignInvite {
  id: UUID;
  campaign_id: UUID;
  email: string;
  role: CampaignRole;
  token: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: ISODate;
  expires_at: ISODate;
  campaign_name?: string;
}

// ── 세션 ──────────────────────────────────────────────────────
export const SESSION_STATUSES = ['scheduled', 'preparing', 'live', 'paused', 'ended', 'cancelled'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: '예정',
  preparing: '준비 중',
  live: '진행 중',
  paused: '일시 중지',
  ended: '종료',
  cancelled: '취소',
};

export interface SessionSummary {
  highlights: string;
  npcs: string;
  locations: string;
  loot: string;
  quests_completed: string;
  quests_new: string;
  combat_result: string;
  next_goals: string;
  dm_notes: string;
}

export interface GameSession {
  id: UUID;
  campaign_id: UUID;
  title: string;
  session_number: number;
  scheduled_at: ISODate | null;
  started_at: ISODate | null;
  ended_at: ISODate | null;
  status: SessionStatus;
  description: string;
  cover_url: string | null;
  summary: SessionSummary | null;
  deleted_at: ISODate | null;
  created_at: ISODate;
}

// ── 폴더 / 태그 / 카드 ─────────────────────────────────────────
export interface Folder {
  id: UUID;
  campaign_id: UUID;
  parent_id: UUID | null;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
  deleted_at: ISODate | null;
}

export interface Tag {
  id: UUID;
  campaign_id: UUID;
  name: string;
  color: string;
}

export const CARD_TYPES = [
  'monster',
  'npc',
  'pc',
  'image',
  'map',
  'location',
  'item',
  'spell',
  'quest',
  'handout',
  'text',
  'rule',
  'custom',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  monster: '몬스터',
  npc: 'NPC',
  pc: '플레이어 캐릭터',
  image: '이미지',
  map: '지도',
  location: '장소',
  item: '아이템',
  spell: '주문',
  quest: '퀘스트',
  handout: '핸드아웃',
  text: '일반 텍스트',
  rule: '규칙 메모',
  custom: '커스텀',
};

export const REVEAL_SCOPES = ['hidden', 'name_only', 'image_only', 'partial', 'full'] as const;
export type RevealScope = (typeof REVEAL_SCOPES)[number];

export const REVEAL_SCOPE_LABELS: Record<RevealScope, string> = {
  hidden: '비공개',
  name_only: '이름만 공개',
  image_only: '이미지만 공개',
  partial: '일부 공개',
  full: '전체 공개',
};

/** partial 공개에서 개별 제어 가능한 필드 키 */
export const REVEALABLE_FIELDS = [
  'name',
  'image',
  'summary',
  'body',
  'hp_current',
  'hp_max',
  'ac',
  'abilities',
  'conditions',
  'actions',
  'speeds',
  'cr',
] as const;
export type RevealableField = (typeof REVEALABLE_FIELDS)[number];

export const REVEALABLE_FIELD_LABELS: Record<RevealableField, string> = {
  name: '이름',
  image: '이미지',
  summary: '요약',
  body: '설명',
  hp_current: '현재 HP',
  hp_max: '최대 HP',
  ac: '방어도',
  abilities: '능력치',
  conditions: '상태 효과',
  actions: '행동 목록',
  speeds: '이동 속도',
  cr: '도전 등급',
};

/** TipTap JSON 문서 (구조를 강제하지 않고 unknown 트리로 둔다) */
export interface RichDoc {
  type: string;
  content?: unknown[];
  [key: string]: unknown;
}

export interface Card {
  id: UUID;
  campaign_id: UUID;
  folder_id: UUID | null;
  type: CardType;
  name: string;
  summary: string;
  body: RichDoc | null;
  image_url: string | null;
  reveal_scope: RevealScope;
  reveal_fields: RevealableField[];
  reveal_targets: UUID[];
  is_temporary_reveal: boolean;
  previous_scope: RevealScope | null;
  is_favorite: boolean;
  is_archived: boolean;
  sort_order: number;
  dm_notes: string;
  created_by: UUID;
  version: number;
  deleted_at: ISODate | null;
  created_at: ISODate;
  updated_at: ISODate;
  /** 조인 결과 */
  tag_ids?: UUID[];
  stats?: MonsterStats | null;
  sections?: CardSection[];
}

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: '힘',
  dex: '민첩',
  con: '건강',
  int: '지능',
  wis: '지혜',
  cha: '매력',
};
export type AbilityScores = Record<AbilityKey, number>;

export interface Speeds {
  walk: number;
  fly: number;
  swim: number;
  climb: number;
  burrow: number;
}

export interface MonsterStats {
  card_id: UUID;
  size: string;
  type: string;
  alignment: string;
  cr: string;
  proficiency_bonus: number;
  xp: number;
  ac: number;
  ac_note: string;
  hp: number;
  max_hp: number;
  temp_hp: number;
  hit_dice: string;
  speeds: Speeds;
  abilities: AbilityScores;
  saves: Partial<Record<AbilityKey, number>>;
  skills: Record<string, number>;
  vulnerabilities: string[];
  resistances: string[];
  immunities: string[];
  condition_immunities: string[];
  senses: string;
  passive_perception: number;
  languages: string;
  spellcasting_ability: AbilityKey | null;
}

export const SECTION_KINDS = [
  'trait',
  'action',
  'bonus',
  'reaction',
  'legendary',
  'mythic',
  'lair',
  'regional',
  'spell',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  trait: '특성',
  action: '행동',
  bonus: '추가 행동',
  reaction: '반응',
  legendary: '전설적 행동',
  mythic: '신화적 행동',
  lair: '소굴 행동',
  regional: '지역 효과',
  spell: '주문 목록',
};

export interface CardSection {
  id: UUID;
  card_id: UUID;
  kind: SectionKind;
  name: string;
  description: string;
  sort_order: number;
}

// ── 캐릭터 ────────────────────────────────────────────────────
export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface CharacterSheetExtra {
  attacks: string;
  spells: string;
  equipment: string;
  inventory: string;
  features: string;
  languages: string;
  proficiencies: string;
  notes: string;
  currency: { pp: number; gp: number; ep: number; sp: number; cp: number };
  spell_slots: { level: number; current: number; max: number }[];
}

export interface CharacterShareSettings {
  show_hp_numbers: boolean;
  show_ac: boolean;
  show_conditions: boolean;
  show_sheet: boolean;
}

export interface PlayerCharacter {
  id: UUID;
  campaign_id: UUID;
  user_id: UUID;
  name: string;
  player_name: string;
  klass: string;
  subclass: string;
  level: number;
  race: string;
  background: string;
  alignment: string;
  xp: number;
  image_url: string | null;
  description: string;
  ac: number;
  hp: number;
  max_hp: number;
  temp_hp: number;
  speed: number;
  proficiency_bonus: number;
  initiative_bonus: number;
  passive_perception: number;
  inspiration: boolean;
  abilities: AbilityScores;
  saves: Partial<Record<AbilityKey, boolean>>;
  skills: Record<string, boolean>;
  death_saves: DeathSaves;
  sheet: CharacterSheetExtra;
  share_settings: CharacterShareSettings;
  version: number;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface CharacterResource {
  id: UUID;
  character_id: UUID;
  name: string;
  current: number;
  max: number;
  recharge: 'short' | 'long' | 'none';
  sort_order: number;
}

// ── 전투 ──────────────────────────────────────────────────────
export type EncounterStatus = 'draft' | 'active' | 'paused' | 'ended';
export type TiebreakRule = 'dex_mod' | 'dex_score' | 'manual';

export interface Encounter {
  id: UUID;
  session_id: UUID;
  campaign_id: UUID;
  name: string;
  status: EncounterStatus;
  round: number;
  active_combatant_id: UUID | null;
  turn_started_at: ISODate | null;
  tiebreak_rule: TiebreakRule;
  version: number;
  created_at: ISODate;
}

export type CombatantSource = 'monster' | 'npc' | 'pc' | 'custom';

export interface Combatant {
  id: UUID;
  encounter_id: UUID;
  source_type: CombatantSource;
  source_card_id: UUID | null;
  character_id: UUID | null;
  name: string;
  image_url: string | null;
  initiative: number | null;
  initiative_tiebreak: number;
  dex_mod: number;
  dex_score: number;
  hp: number;
  max_hp: number;
  temp_hp: number;
  ac: number;
  is_hidden: boolean;
  is_defeated: boolean;
  is_concentrating: boolean;
  concentration_note: string;
  hide_hp_numbers: boolean;
  dm_notes: string;
  sort_order: number;
  conditions?: CombatantCondition[];
}

export interface ConditionDef {
  id: UUID;
  campaign_id: UUID | null;
  key: string;
  name: string;
  icon: string;
  description: string;
}

export const DURATION_MODES = [
  'rounds',
  'target_turn_start',
  'target_turn_end',
  'source_turn_start',
  'source_turn_end',
  'manual',
] as const;
export type DurationMode = (typeof DURATION_MODES)[number];

export const DURATION_MODE_LABELS: Record<DurationMode, string> = {
  rounds: '지정 라운드 수',
  target_turn_start: '대상의 다음 턴 시작까지',
  target_turn_end: '대상의 다음 턴 종료까지',
  source_turn_start: '시전자 다음 턴 시작까지',
  source_turn_end: '시전자 다음 턴 종료까지',
  manual: '수동 해제까지',
};

/**
 * 상태 효과 라이브러리 항목.
 * campaign_id가 null이면 모든 캠페인이 공유하는 시스템 기본 상태다.
 * 캠페인 전용 상태는 DM이 직접 만들고 수정할 수 있다.
 */
export interface Condition {
  id: UUID;
  campaign_id: UUID | null;
  key: string;
  name: string;
  icon: string;
  description: string;
  /** 누적되는 상태인지 (예: 출혈 3) */
  is_stackable: boolean;
  /** 배지 색. `#rrggbb` 형식만 허용한다. */
  color: string | null;
  sort_order: number;
}

export interface CombatantCondition {
  id: UUID;
  combatant_id: UUID;
  condition_key: string;
  custom_name: string | null;
  icon: string;
  description: string;
  /** 누적 수치. 스택을 쓰지 않는 상태는 1로 둔다. */
  stacks: number;
  started_round: number;
  duration_mode: DurationMode;
  duration_rounds: number | null;
  source_combatant_id: UUID | null;
  linked_concentration: boolean;
  is_public: boolean;
  created_at: ISODate;
}

// ── 타이머 ────────────────────────────────────────────────────
export type TimerKind = 'countdown' | 'stopwatch';
export type TimerState = 'idle' | 'running' | 'paused' | 'finished';

export interface Timer {
  id: UUID;
  session_id: UUID;
  name: string;
  description: string;
  kind: TimerKind;
  duration_seconds: number;
  /** 실행 중일 때의 절대 종료 예정 시각(countdown) 또는 시작 시각(stopwatch) 기준점 */
  ends_at: ISODate | null;
  started_at: ISODate | null;
  /** 일시 정지 시점의 남은 시간(ms). countdown 전용 */
  paused_remaining_ms: number | null;
  /** 일시 정지 시점까지의 경과 시간(ms). stopwatch 전용 */
  elapsed_ms: number;
  state: TimerState;
  is_shared: boolean;
  end_message: string;
  sound_on_end: boolean;
  created_by: UUID;
  created_at: ISODate;
}

// ── 주사위 ────────────────────────────────────────────────────
export const DICE_VISIBILITIES = ['all', 'dm', 'self', 'dm_secret'] as const;
export type DiceVisibility = (typeof DICE_VISIBILITIES)[number];

export const DICE_VISIBILITY_LABELS: Record<DiceVisibility, string> = {
  all: '전체 공개',
  dm: 'DM에게만',
  self: '나만 보기',
  dm_secret: 'DM 비공개 굴림',
};

export interface DieGroupResult {
  count: number;
  sides: number;
  rolls: number[];
  kept: number[];
  sign: 1 | -1;
  keep?: { mode: 'kh' | 'kl'; n: number };
}

export interface RollDetail {
  groups: DieGroupResult[];
  modifier: number;
}

export interface DiceRoll {
  id: UUID;
  session_id: UUID | null;
  campaign_id: UUID;
  user_id: UUID;
  user_name: string;
  expression: string;
  detail: RollDetail;
  total: number;
  purpose: string;
  visibility: DiceVisibility;
  created_at: ISODate;
}

// ── 알림 / 로그 ───────────────────────────────────────────────
export const NOTIFICATION_TYPES = [
  'campaign_invite',
  'join_approved',
  'session_started',
  'handout_revealed',
  'card_revealed',
  'turn_started',
  'timer_finished',
  'condition_applied',
  'condition_expired',
  'hp_zero',
  'concentration_check',
  'session_rescheduled',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  campaign_invite: '캠페인 초대',
  join_approved: '참여 요청 승인',
  session_started: '세션 시작',
  handout_revealed: '새 핸드아웃 공개',
  card_revealed: '카드 공개',
  turn_started: '내 턴 시작',
  timer_finished: '타이머 종료',
  condition_applied: '상태 효과 적용',
  condition_expired: '상태 효과 종료',
  hp_zero: 'HP 0',
  concentration_check: '집중 굴림 필요',
  session_rescheduled: '세션 일정 변경',
};

export interface AppNotification {
  id: UUID;
  user_id: UUID;
  campaign_id: UUID | null;
  session_id: UUID | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: ISODate | null;
  created_at: ISODate;
}

export type LogVisibility = 'all' | 'dm';

export interface SessionLog {
  id: UUID;
  session_id: UUID;
  campaign_id: UUID;
  actor_id: UUID | null;
  actor_name: string;
  event_type: string;
  target_type: string | null;
  target_id: UUID | null;
  target_name: string;
  before: unknown;
  after: unknown;
  message: string;
  visibility: LogVisibility;
  undone: boolean;
  created_at: ISODate;
}

export interface AuditLog {
  id: UUID;
  campaign_id: UUID | null;
  actor_id: UUID | null;
  actor_name: string;
  action: string;
  target_type: string | null;
  target_id: UUID | null;
  meta: Record<string, unknown>;
  created_at: ISODate;
}

export interface UploadedFile {
  id: UUID;
  campaign_id: UUID;
  owner_id: UUID;
  bucket: string;
  path: string;
  url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  thumb_url: string | null;
  original_name: string;
  created_at: ISODate;
}

export interface DeletedItem {
  id: UUID;
  campaign_id: UUID;
  entity_type: string;
  entity_id: UUID;
  label: string;
  payload: unknown;
  deleted_by: UUID;
  deleted_at: ISODate;
  purge_after: ISODate;
}

export interface CardTemplate {
  id: UUID;
  campaign_id: UUID | null;
  name: string;
  card_type: CardType;
  description: string;
  payload: {
    summary?: string;
    dm_notes?: string;
    sections?: { kind: SectionKind; name: string; description: string }[];
    stats?: Partial<MonsterStats>;
    bodyText?: string;
  };
  is_system: boolean;
}

// ── 세션 참가자 / 접속 상태 ────────────────────────────────────
export interface SessionParticipant {
  session_id: UUID;
  user_id: UUID;
  display_name: string;
  role: CampaignRole;
  is_online: boolean;
  joined_at: ISODate;
}

/** 뷰어 컨텍스트 — 공개 범위 계산에 사용 */
export interface ViewerContext {
  userId: UUID;
  role: CampaignRole;
  permissions: Permissions;
}
