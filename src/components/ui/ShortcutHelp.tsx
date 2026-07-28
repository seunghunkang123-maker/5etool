import { useState } from 'react';
import { Dialog } from './Dialog';
import { SHORTCUT_HELP, useShortcuts } from '@/hooks/useShortcuts';

/**
 * 전역 단축키 도움말.
 * `?` 키로 열고 Escape로 닫는다. (마우스로도 설정 화면에서 같은 목록을 볼 수 있다.)
 */
export function ShortcutHelpHost() {
  const [open, setOpen] = useState(false);

  useShortcuts([{ combo: '?', handler: () => setOpen((value) => !value) }]);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="키보드 단축키"
      description="입력란에 글을 쓰는 중에는 단일 키 단축키가 동작하지 않습니다."
      size="md"
    >
      <dl className="flex flex-col gap-2">
        {SHORTCUT_HELP.map((item) => (
          <div
            key={item.keys}
            className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <dt className="text-[var(--color-fg-muted)]">{item.description}</dt>
            <dd>
              <kbd className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-xs">{item.keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
