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
  UUID,
  UploadedFile,
  UserPreferences,
} from '../types';
import type { RealtimeEvent } from '../repository';

/**
 * 데모 모드용 브라우저 로컬 저장소.
 *
 * ⚠️ 운영 환경에서는 사용하지 않는다. Supabase 어댑터가 RLS로 접근을 통제한다.
 *    이 어댑터는 인프라 없이 앱을 실행/테스트하기 위한 것이다.
 */

const DB_KEY = 'arcanum:db';
const REV_KEY = 'arcanum:db-rev';
const EVENT_KEY = 'arcanum:last-event';
const POLL_INTERVAL_MS = 1000;
const SESSION_KEY = 'arcanum:session';
const CHANNEL = 'arcanum:realtime';

export interface LocalAccount {
  id: UUID;
  email: string;
  password_hash: string;
  email_confirmed: boolean;
}

export interface LocalDB {
  accounts: LocalAccount[];
  profiles: Profile[];
  preferences: UserPreferences[];
  campaigns: Campaign[];
  members: CampaignMember[];
  invites: CampaignInvite[];
  sessions: GameSession[];
  participants: SessionParticipant[];
  folders: Folder[];
  tags: Tag[];
  cards: Card[];
  cardTags: { card_id: UUID; tag_id: UUID }[];
  sections: CardSection[];
  monsterStats: MonsterStats[];
  characters: PlayerCharacter[];
  resources: CharacterResource[];
  encounters: Encounter[];
  combatants: Combatant[];
  conditions: CombatantCondition[];
  timers: Timer[];
  diceRolls: DiceRoll[];
  notifications: AppNotification[];
  sessionLogs: SessionLog[];
  auditLogs: AuditLog[];
  files: UploadedFile[];
  deletedItems: DeletedItem[];
  templates: CardTemplate[];
}

export function emptyDB(): LocalDB {
  return {
    accounts: [],
    profiles: [],
    preferences: [],
    campaigns: [],
    members: [],
    invites: [],
    sessions: [],
    participants: [],
    folders: [],
    tags: [],
    cards: [],
    cardTags: [],
    sections: [],
    monsterStats: [],
    characters: [],
    resources: [],
    encounters: [],
    combatants: [],
    conditions: [],
    timers: [],
    diceRolls: [],
    notifications: [],
    sessionLogs: [],
    auditLogs: [],
    files: [],
    deletedItems: [],
    templates: [],
  };
}

export function uid(): UUID {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/** 데모 전용 비밀번호 해시. 실제 인증은 Supabase Auth가 담당한다. */
export async function hashPassword(password: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  const salted = `arcanum-demo:${password}`;
  if (!subtle) {
    let hash = 0;
    for (let i = 0; i < salted.length; i += 1) {
      hash = (hash << 5) - hash + salted.charCodeAt(i);
      hash |= 0;
    }
    return `fallback:${hash}`;
  }
  const bytes = new TextEncoder().encode(salted);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

type Listener = (event: RealtimeEvent) => void;

class LocalStore {
  private db: LocalDB = emptyDB();
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  private loaded = false;
  private pollTimer: number | null = null;
  /** 마지막으로 읽어들인 저장소 리비전. 다른 탭이 쓰면 값이 달라진다. */
  private rev = '';
  /** 구독자에게 이미 알린 리비전 (중복 알림 방지) */
  private seenRev = '';

  load(): LocalDB {
    if (this.loaded) return this.db;
    this.loaded = true;
    this.readFromStorage();
    this.attachCrossTabSync();
    return this.db;
  }

  /**
   * 탭 간 변경 전파.
   * 어느 한 경로만으로는 전달이 누락될 수 있어 세 가지를 함께 사용하고,
   * 리비전으로 중복을 제거해 같은 변경이 두 번 처리되지 않게 한다.
   *   1) BroadcastChannel — 즉시 전달
   *   2) storage 이벤트 — 다른 탭의 localStorage 쓰기를 감지
   *   3) 주기적 확인 — 위 두 경로가 모두 실패했을 때의 마지막 안전망
   */
  private attachCrossTabSync(): void {
    if (typeof BroadcastChannel !== 'undefined' && !this.channel) {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (message: MessageEvent<{ type: string; rev?: string; event?: RealtimeEvent }>) => {
        if (message.data?.type === 'change') this.handleRemoteChange(message.data.rev, message.data.event);
      };
    }

    globalThis.addEventListener?.('storage', (event) => {
      const storageEvent = event as StorageEvent;
      if (storageEvent.key === REV_KEY || storageEvent.key === DB_KEY) this.handleRemoteChange();
    });

    if (this.pollTimer === null && typeof setInterval === 'function') {
      this.pollTimer = setInterval(() => this.handleRemoteChange(), POLL_INTERVAL_MS) as unknown as number;
    }
  }

  /** 다른 탭의 변경을 감지해 구독자에게 알린다. 이미 처리한 리비전이면 무시한다. */
  private handleRemoteChange(rev?: string, event?: RealtimeEvent): void {
    let currentRev = rev;
    try {
      currentRev = globalThis.localStorage?.getItem(REV_KEY) ?? rev ?? '';
    } catch {
      /* 무시 */
    }
    if (!currentRev || currentRev === this.seenRev) return;
    this.seenRev = currentRev;
    this.readFromStorage();

    let payload = event;
    if (!payload) {
      try {
        const raw = globalThis.localStorage?.getItem(EVENT_KEY);
        payload = raw ? (JSON.parse(raw) as RealtimeEvent) : undefined;
      } catch {
        payload = undefined;
      }
    }
    const notification: RealtimeEvent = payload ?? { table: '*', eventType: 'UPDATE', new: null, old: null };
    for (const listener of this.listeners) listener(notification);
  }

  private readFromStorage(): void {
    try {
      const raw = globalThis.localStorage?.getItem(DB_KEY);
      this.db = raw ? { ...emptyDB(), ...(JSON.parse(raw) as Partial<LocalDB>) } : emptyDB();
      this.rev = globalThis.localStorage?.getItem(REV_KEY) ?? '';
      if (!this.seenRev) this.seenRev = this.rev;
    } catch {
      this.db = emptyDB();
    }
  }

  /**
   * 항상 최신 상태를 반환한다.
   * 다른 탭이 저장소를 갱신했다면(리비전 불일치) 다시 읽어들인다.
   * → 오래된 메모리 스냅샷으로 다른 탭의 변경을 덮어쓰는 문제를 막는다.
   */
  get data(): LocalDB {
    this.load();
    try {
      const currentRev = globalThis.localStorage?.getItem(REV_KEY) ?? '';
      if (currentRev !== this.rev) this.readFromStorage();
    } catch {
      /* 저장소 접근 불가 시 메모리 상태를 그대로 사용한다 */
    }
    return this.db;
  }

  persist(event?: RealtimeEvent): void {
    try {
      globalThis.localStorage?.setItem(DB_KEY, JSON.stringify(this.db));
      this.rev = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      this.seenRev = this.rev;
      globalThis.localStorage?.setItem(REV_KEY, this.rev);
      if (event) globalThis.localStorage?.setItem(EVENT_KEY, JSON.stringify(event));
    } catch (error) {
      console.warn('로컬 저장소에 기록하지 못했습니다.', error);
    }
  }

  /** 변경을 저장하고 같은 브라우저의 다른 탭에 실시간 이벤트를 전파한다. */
  commit(event: RealtimeEvent): void {
    this.persist(event);
    for (const listener of this.listeners) listener(event);
    this.channel?.postMessage({ type: 'change', rev: this.rev, event });
  }

  subscribe(listener: Listener): () => void {
    this.load();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 데모 모드의 로그인 세션은 탭 단위(sessionStorage)로 보관한다.
   * 데이터(localStorage)는 탭 사이에서 공유하되 로그인 계정은 분리되므로,
   * 한 브라우저에서 던전 마스터 탭과 플레이어 탭을 동시에 열어 실시간 동기화를 확인할 수 있다.
   */
  getCurrentUserId(): UUID | null {
    try {
      return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? null;
    } catch {
      return null;
    }
  }

  setCurrentUserId(id: UUID | null): void {
    try {
      if (id) globalThis.sessionStorage?.setItem(SESSION_KEY, id);
      else globalThis.sessionStorage?.removeItem(SESSION_KEY);
    } catch {
      /* 무시 */
    }
  }

  reset(): void {
    this.db = emptyDB();
    this.loaded = true;
    this.persist();
    this.setCurrentUserId(null);
  }
}

export const localStore = new LocalStore();

export function makeEvent(
  table: string,
  eventType: RealtimeEvent['eventType'],
  row: Record<string, unknown> | null,
  old: Record<string, unknown> | null = null,
): RealtimeEvent {
  return { table, eventType, new: row, old };
}

/** 참여 코드 생성 — 혼동하기 쉬운 문자를 제외한 6자리 */
export function generateJoinCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
