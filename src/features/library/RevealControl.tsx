import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select } from '@/components/ui/Field';
import {
  REVEALABLE_FIELDS,
  REVEALABLE_FIELD_LABELS,
  REVEAL_SCOPES,
  REVEAL_SCOPE_LABELS,
  type Card,
  type RevealScope,
  type RevealableField,
} from '@/data/types';
import { useMembers } from '@/hooks/queries';
import type { RevealInput } from '@/data/repository';

const SCOPE_DESCRIPTIONS: Record<RevealScope, string> = {
  hidden: '플레이어는 카드의 존재 자체를 볼 수 없습니다.',
  name_only: '플레이어는 카드 이름과 유형만 봅니다.',
  image_only: '플레이어는 이름과 대표 이미지만 봅니다.',
  partial: '아래에서 선택한 필드만 공개합니다.',
  full: '공개 가능한 모든 정보를 봅니다. (DM 전용 메모는 항상 제외)',
};

interface RevealDialogProps {
  card: Card;
  campaignId: string;
  sessionId?: string | null;
  onClose: () => void;
  onSubmit: (input: RevealInput) => Promise<void>;
}

export function RevealDialog({ card, campaignId, sessionId, onClose, onSubmit }: RevealDialogProps) {
  const { data: members = [] } = useMembers(campaignId);
  const players = members.filter((m) => m.role === 'player' || m.role === 'spectator');

  const [scope, setScope] = useState<RevealScope>(card.reveal_scope === 'hidden' ? 'full' : card.reveal_scope);
  const [fields, setFields] = useState<RevealableField[]>(card.reveal_fields.length > 0 ? card.reveal_fields : ['name', 'image']);
  const [targets, setTargets] = useState<string[]>(card.reveal_targets);
  const [temporary, setTemporary] = useState(card.is_temporary_reveal);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ scope, fields, targets, temporary, sessionId: sessionId ?? null });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`"${card.name}" 공개 설정`}
      description="플레이어에게 어떤 정보까지 보여줄지 선택합니다."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            <Eye aria-hidden className="h-4 w-4" />
            적용
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="공개 범위" hint={SCOPE_DESCRIPTIONS[scope]}>
          {({ id }) => (
            <Select id={id} value={scope} onChange={(e) => setScope(e.target.value as RevealScope)}>
              {REVEAL_SCOPES.map((value) => (
                <option key={value} value={value}>
                  {REVEAL_SCOPE_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {scope === 'partial' ? (
          <fieldset className="rounded-lg border border-[var(--color-border)] p-3">
            <legend className="px-1 text-sm font-medium">공개할 필드</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {REVEALABLE_FIELDS.map((field) => (
                <Checkbox
                  key={field}
                  label={REVEALABLE_FIELD_LABELS[field]}
                  checked={fields.includes(field)}
                  onChange={(e) =>
                    setFields((prev) => (e.target.checked ? [...prev, field] : prev.filter((f) => f !== field)))
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        {players.length > 0 ? (
          <fieldset className="rounded-lg border border-[var(--color-border)] p-3">
            <legend className="px-1 text-sm font-medium">공개 대상</legend>
            <p className="mb-2 text-xs text-[var(--color-fg-muted)]">아무도 선택하지 않으면 전체 플레이어에게 공개됩니다.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {players.map((member) => (
                <Checkbox
                  key={member.user_id}
                  label={member.profile?.display_name ?? '알 수 없음'}
                  checked={targets.includes(member.user_id)}
                  onChange={(e) =>
                    setTargets((prev) => (e.target.checked ? [...prev, member.user_id] : prev.filter((id) => id !== member.user_id)))
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <Checkbox
          label="이번 세션에만 공개"
          hint="세션이 끝나면 이전 공개 상태로 자동으로 돌아갑니다."
          checked={temporary}
          onChange={(e) => setTemporary(e.target.checked)}
        />
      </div>
    </Dialog>
  );
}

/** 목록에서 바로 쓰는 공개/비공개 토글 버튼 */
export function RevealToggleButton({
  card,
  onReveal,
  onHide,
  compact = false,
}: {
  card: Card;
  onReveal: () => void;
  onHide: () => void;
  compact?: boolean;
}) {
  const revealed = card.reveal_scope !== 'hidden';
  return (
    <Button
      variant={revealed ? 'primary' : 'secondary'}
      size={compact ? 'sm' : 'md'}
      onClick={revealed ? onHide : onReveal}
      aria-label={revealed ? `${card.name} 비공개로 전환` : `${card.name} 공개하기`}
      title={revealed ? REVEAL_SCOPE_LABELS[card.reveal_scope] : '비공개'}
    >
      {revealed ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
      {compact ? null : revealed ? REVEAL_SCOPE_LABELS[card.reveal_scope] : '공개하기'}
    </Button>
  );
}
