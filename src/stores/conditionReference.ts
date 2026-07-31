import { create } from 'zustand';

/**
 * 상태 효과 조회 창의 열림 상태.
 *
 * 배지 클릭, 상단바 버튼, 단축키 등 여러 곳에서 같은 창을 여닫아야 해서
 * 전역 상태로 둔다. `focusKey`를 주면 그 상태를 펼친 채로 연다.
 */
interface ConditionReferenceState {
  open: boolean;
  focusKey: string | null;
  show: (focusKey?: string) => void;
  close: () => void;
  toggle: () => void;
}

export const useConditionReference = create<ConditionReferenceState>((set, get) => ({
  open: false,
  focusKey: null,
  show: (focusKey) => set({ open: true, focusKey: focusKey ?? null }),
  close: () => set({ open: false, focusKey: null }),
  toggle: () => (get().open ? set({ open: false, focusKey: null }) : set({ open: true, focusKey: null })),
}));
