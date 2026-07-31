import { useState } from 'react';
import { repo } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { THEME_COLORS, THEME_COLOR_LABELS } from '@/features/campaigns/themeColor';
import type { ConditionEntry } from '@/domain/conditionLibrary';

/**
 * 캠페인 전용 상태 효과 편집기.
 *
 * 첫 줄을 요약으로, 나머지 줄을 세부 규칙으로 저장한다.
 * 조회 창이 같은 규칙으로 나눠 보여준다.
 */
export function ConditionTemplateEditor({
  campaignId,
  entry,
  onClose,
  onSaved,
}: {
  campaignId: string;
  entry: ConditionEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(entry?.name ?? '');
  const [description, setDescription] = useState(
    entry ? [entry.summary, ...entry.details].filter(Boolean).join('\n') : '',
  );
  const [isStackable, setIsStackable] = useState(entry?.isStackable ?? false);
  const [color, setColor] = useState<string | null>(entry?.color ?? null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error('상태 이름을 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      await repo().combat.saveConditionTemplate(campaignId, {
        ...(entry ? { id: entry.id } : {}),
        name: name.trim(),
        description: description.trim(),
        is_stackable: isStackable,
        color,
      });
      toast.success(entry ? '상태 효과를 수정했습니다.' : '상태 효과를 추가했습니다.');
      onSaved();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={entry ? '상태 효과 수정' : '상태 효과 추가'}
      description="이 캠페인에서만 쓰는 상태입니다. 플레이어도 도감에서 확인할 수 있습니다."
      disableBackdropClose
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" onClick={save} loading={busy}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="이름" required>
          {({ id }) => (
            <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 출혈" autoFocus />
          )}
        </Field>

        <Field
          label="설명"
          hint="첫 줄은 요약으로, 나머지 줄은 세부 규칙으로 표시됩니다."
        >
          {({ id }) => (
            <Textarea
              id={id}
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'턴 시작 시 스택만큼 피해를 받는다.\n스택은 턴이 끝날 때 1 줄어든다.\n같은 효과를 다시 받으면 스택이 쌓인다.'}
            />
          )}
        </Field>

        <Checkbox
          label="누적되는 상태 (스택)"
          checked={isStackable}
          onChange={(e) => setIsStackable(e.target.checked)}
          hint="켜면 전투 화면에서 숫자를 올리고 내릴 수 있습니다."
        />

        <fieldset>
          <legend className="text-sm font-medium">배지 색상</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              aria-label="기본 색상"
              aria-pressed={color === null}
              onClick={() => setColor(null)}
              className="h-9 rounded-lg border-2 px-3 text-sm"
              style={{ borderColor: color === null ? 'var(--color-fg)' : 'var(--color-border)' }}
            >
              기본
            </button>
            {THEME_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`배지 색상 ${THEME_COLOR_LABELS[option] ?? option}`}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                className="h-9 w-9 rounded-full border-2"
                style={{
                  backgroundColor: option,
                  borderColor: color === option ? 'var(--color-fg)' : 'transparent',
                }}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
