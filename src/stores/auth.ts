import { create } from 'zustand';
import type { Profile } from '@/data/types';
import type { AuthUser } from '@/data/repository';
import { repo } from '@/data';

interface AuthState {
  user: AuthUser | null;
  profile: Profile | null;
  loading: boolean;
  setState: (user: AuthUser | null, profile: Profile | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  loading: true,
  setState: (user, profile) => set({ user, profile, loading: false }),
  refresh: async () => {
    const state = await repo().auth.getSession();
    set({ user: state.user, profile: state.profile, loading: false });
  },
  signOut: async () => {
    await repo().auth.signOut();
    set({ user: null, profile: null, loading: false });
  },
}));

/** 앱 시작 시 1회 호출해 세션을 복원하고 변경을 구독한다. */
export function initAuth(): () => void {
  void useAuthStore.getState().refresh();
  return repo().auth.onChange((state) => {
    useAuthStore.getState().setState(state.user, state.profile);
  });
}
