import { create } from 'zustand';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { toUserMessage } from '@/lib/errors';
import { toast } from './Toast';

/**
 * 위험한 작업(삭제 등)에 사용하는 확인 다이얼로그.
 * window.confirm을 대체한다.
 */

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions;
  resolve: ((value: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  close: (value: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '' },
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolve });
    }),
  close: (value) => {
    get().resolve?.(value);
    set({ open: false, resolve: null });
  },
}));

/** 확인 다이얼로그를 띄우고 사용자의 선택을 기다린다. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}

/**
 * 확인 후 비동기 작업을 실행하는 도우미.
 * 실패 시 사용자용 한국어 오류 메시지를 Toast로 보여준다.
 */
export async function confirmAndRun(options: ConfirmOptions, run: () => Promise<void>, successMessage?: string): Promise<void> {
  const ok = await confirmDialog(options);
  if (!ok) return;
  try {
    await run();
    if (successMessage) toast.success(successMessage);
  } catch (error) {
    toast.error(toUserMessage(error));
  }
}

export function ConfirmDialogHost() {
  const { open, options, close } = useConfirmStore();
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={open}
      onClose={() => close(false)}
      title={options.title}
      description={options.description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {options.cancelLabel ?? '취소'}
          </Button>
          <Button
            variant={options.danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={() => {
              setBusy(true);
              close(true);
              setBusy(false);
            }}
          >
            {options.confirmLabel ?? '확인'}
          </Button>
        </>
      }
    />
  );
}
