import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { repo } from '@/data';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * 이미지 업로드.
 * - 드래그 앤 드롭 / 파일 선택 / 클립보드 붙여넣기
 * - 확장자만 믿지 않고 MIME type과 용량을 검증한다(서버 정책과 이중 확인).
 * - 업로드 전 클라이언트에서 압축해 대용량 이미지를 줄인다.
 */

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const COMPRESS_THRESHOLD = 1024 * 1024;
const MAX_DIMENSION = 2000;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'PNG, JPEG, WebP, GIF, AVIF 이미지만 업로드할 수 있습니다.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `이미지 용량은 ${formatBytes(MAX_IMAGE_BYTES)}를 넘을 수 없습니다. (현재 ${formatBytes(file.size)})`;
  }
  return null;
}

/** 큰 이미지를 캔버스로 축소해 업로드 용량을 줄인다. */
export async function compressImage(file: File): Promise<File> {
  if (file.size < COMPRESS_THRESHOLD || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < COMPRESS_THRESHOLD * 3) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp' });
  } catch {
    return file;
  }
}

interface ImageUploadProps {
  campaignId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  label?: string;
}

export function ImageUpload({ campaignId, value, onChange, label = '대표 이미지' }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      const error = validateImageFile(file);
      if (error) {
        toast.error(error);
        return;
      }
      setProgress(0);
      try {
        const compressed = await compressImage(file);
        const uploaded = await repo().files.upload(campaignId, compressed, setProgress);
        onChange(uploaded.url);
        toast.success('이미지를 업로드했습니다.');
      } catch (err) {
        toast.error(toUserMessage(err, '이미지를 업로드하지 못했습니다.'));
      } finally {
        setProgress(null);
      }
    },
    [campaignId, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>

      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-[var(--color-border)]">
          <img src={value} alt="" className="max-h-56 w-full object-cover" loading="lazy" />
          <Button
            variant="danger"
            size="icon"
            aria-label="이미지 제거"
            className="absolute right-2 top-2 h-8 w-8"
            onClick={() => onChange(null)}
          >
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          onPaste={(e) => {
            const file = e.clipboardData.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center',
            dragging ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5' : 'border-[var(--color-border)]',
          )}
        >
          {progress !== null ? (
            <>
              <Loader2 aria-hidden className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
              <p role="status" className="text-sm text-[var(--color-fg-muted)]">
                업로드 중… {progress}%
              </p>
              <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                <div className="h-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </>
          ) : (
            <>
              <ImagePlus aria-hidden className="h-6 w-6 text-[var(--color-fg-muted)]" />
              <p className="text-sm text-[var(--color-fg-muted)]">이미지를 끌어다 놓거나 붙여넣기(Ctrl+V) 하세요</p>
              <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                파일 선택
              </Button>
              <p className="text-xs text-[var(--color-fg-muted)]">PNG · JPEG · WebP · GIF · 최대 {formatBytes(MAX_IMAGE_BYTES)}</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            className="sr-only"
            aria-label="이미지 파일 선택"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
