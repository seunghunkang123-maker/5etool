import { create } from 'zustand';
import type { Density, NotificationPrefs, ThemeMode, UserPreferences } from '@/data/types';
import { repo } from '@/data';
import { defaultPreferences } from '@/data/defaults';

/**
 * 테마 · 밀도 · 글자 크기 · 패널 레이아웃 설정.
 * 계정에 저장하고, 로그인 전에는 로컬 값으로 동작한다.
 */

const LOCAL_KEY = 'arcanum:prefs';

interface PreferencesState extends UserPreferences {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<UserPreferences>) => Promise<void>;
  setPanel: (key: string, value: number | boolean) => void;
}

function readLocal(): Partial<UserPreferences> {
  try {
    const raw = globalThis.localStorage?.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Partial<UserPreferences>) : {};
  } catch {
    return {};
  }
}

function writeLocal(prefs: UserPreferences): void {
  try {
    globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify(prefs));
  } catch {
    /* 저장 실패는 무시 */
  }
}

const initial: UserPreferences = { ...defaultPreferences('local'), ...readLocal() };

export const usePreferences = create<PreferencesState>((set, get) => ({
  ...initial,
  loaded: false,
  load: async () => {
    try {
      const prefs = await repo().auth.getPreferences();
      set({ ...prefs, loaded: true });
      applyPreferences(prefs);
      writeLocal(prefs);
    } catch {
      // 로그인 전이거나 네트워크 오류 — 로컬 설정으로 계속 동작한다.
      set({ loaded: true });
      applyPreferences(get());
    }
  },
  update: async (patch) => {
    const next = { ...get(), ...patch } as UserPreferences;
    set(patch);
    applyPreferences(next);
    writeLocal(next);
    try {
      await repo().auth.savePreferences(patch);
    } catch {
      // 서버 저장 실패해도 화면 설정은 유지한다.
    }
  },
  setPanel: (key, value) => {
    const layout = { ...get().panel_layout, [key]: value };
    set({ panel_layout: layout });
    void get().update({ panel_layout: layout });
  },
}));

let mediaQuery: MediaQueryList | null = null;

/** 설정을 실제 DOM에 반영한다. */
export function applyPreferences(prefs: Pick<UserPreferences, 'theme' | 'density' | 'font_scale' | 'reduce_motion'>): void {
  const root = document.documentElement;
  const resolveDark = (theme: ThemeMode): boolean => {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  };
  root.classList.toggle('dark', resolveDark(prefs.theme));
  root.dataset.density = prefs.density;
  root.style.setProperty('--font-scale', String(prefs.font_scale));
  root.dataset.reduceMotion = String(prefs.reduce_motion);

  // 시스템 설정 추종 시 변경을 구독한다.
  if (!mediaQuery && globalThis.matchMedia) {
    mediaQuery = globalThis.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      const current = usePreferences.getState();
      if (current.theme === 'system') {
        document.documentElement.classList.toggle('dark', mediaQuery?.matches ?? false);
      }
    });
  }
}

export const THEME_LABELS: Record<ThemeMode, string> = {
  light: '밝은 테마',
  dark: '어두운 테마',
  system: '시스템 설정 따르기',
};

export const DENSITY_LABELS: Record<Density, string> = {
  comfortable: '여유롭게',
  default: '기본',
  compact: '촘촘하게',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<keyof NotificationPrefs, string> = {
  in_app: '앱 내부 알림',
  sound: '소리',
  browser: '브라우저 알림',
  email: '이메일 알림',
};
