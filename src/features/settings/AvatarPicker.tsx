import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { repo } from '@/data';
import { useAuthStore } from '@/stores/auth';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { toUserMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';

/**
 * 프로필 이미지 선택.
 *
 * - 파일 선택과 드래그 앤 드롭을 모두 지원한다. 드래그가 어려운 환경에서도
 *   버튼만으로 같은 일을 할 수 있어야 한다(접근성).
 * - 확장자만 믿지 않고 MIME type과 용량을 클라이언트에서 먼저 확인한다.
 *   같은 제한을 저장소 어댑터와 Storage 정책이 다시 검사한다.
 */

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

function validate(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return 'PNG, JPEG, WebP 이미지만 사용할 수 있습니다.';
  if (file.size > MAX_BYTES) {
    return `프로필 이미지는 ${formatBytes(MAX_BYTES)}를 넘을 수 없습니다. (현재 ${formatBytes(file.size)})`;
  }
  return null;
}

export function AvatarPicker() {
  const { profile, refresh } = useAuthStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const upload = async (file: File) => {
    const problem = validate(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      await repo().auth.uploadAvatar(file);
      await refresh();
      toast.success('프로필 이미지를 변경했습니다.');
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = () =>
    confirmAndRun(
      {
        title: '프로필 이미지를 삭제할까요?',
        description: '이미지를 지우면 표시 이름의 첫 글자가 보입니다.',
        confirmLabel: '삭제',
        danger: true,
      },
      async () => {
        await repo().auth.removeAvatar();
        await refresh();
      },
      '프로필 이미지를 삭제했습니다.',
    );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void upload(file);
      }}
      className={
        'flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-4 transition-colors ' +
        (dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-[var(--color-border)]')
      }
    >
      <Avatar url={profile?.avatar_url} name={profile?.display_name} size="xl" />

      <div className="flex min-w-52 flex-1 flex-col gap-2">
        <p className="text-sm text-[var(--color-fg-muted)]">
          PNG · JPEG · WebP · 최대 {formatBytes(MAX_BYTES)}
          <br />
          파일을 이 영역에 끌어다 놓거나 버튼으로 선택하세요.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => inputRef.current?.click()} loading={busy}>
            <Upload aria-hidden className="h-4 w-4" />
            이미지 선택
          </Button>
          {profile?.avatar_url ? (
            <Button variant="ghost" onClick={remove} disabled={busy}>
              <Trash2 aria-hidden className="h-4 w-4" />
              삭제
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(',')}
          className="sr-only"
          aria-label="프로필 이미지 파일 선택"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
    </div>
  );
}
