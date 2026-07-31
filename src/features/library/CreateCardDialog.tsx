import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { repo } from '@/data';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/errors';
import { plainTextToDoc } from '@/domain/sanitize';
import { CARD_TYPES, CARD_TYPE_LABELS, type Card, type CardTemplate, type CardType, type UUID } from '@/data/types';

/**
 * 새 카드 만들기.
 *
 * 자료 보관함과 세션 화면 양쪽에서 쓰므로 별도 파일로 두었다.
 * (LibraryPage 안에 있으면 세션 묶음에 보관함 화면 전체가 딸려 들어간다.)
 */
export function CreateCardDialog({
  campaignId,
  folderId,
  onClose,
  onCreated,
}: {
  campaignId: string;
  folderId: UUID | null;
  onClose: () => void;
  onCreated: (card: Card) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CardType>('monster');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<CardTemplate[]>([]);

  useMemo(() => {
    void repo().library.templates(campaignId).then(setTemplates);
  }, [campaignId]);

  const create = async () => {
    setBusy(true);
    try {
      const template = templates.find((t) => t.id === templateId);
      const card = await repo().library.createCard(campaignId, {
        type,
        name: name.trim() || '이름 없는 카드',
        folder_id: folderId,
        summary: template?.payload.summary ?? '',
        dm_notes: template?.payload.dm_notes ?? '',
        body: template?.payload.bodyText ? plainTextToDoc(template.payload.bodyText) : null,
        sections: (template?.payload.sections ?? []).map((s, i) => ({ ...s, sort_order: i })),
      });
      toast.success('카드를 만들었습니다.');
      onCreated(card);
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
      title="새 카드"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={create}>
            만들기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="카드 이름" required>
          {({ id }) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="예: 얼음 호수의 기사"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
          )}
        </Field>
        <Field label="카드 유형">
          {({ id }) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as CardType)}>
              {CARD_TYPES.map((value) => (
                <option key={value} value={value}>
                  {CARD_TYPE_LABELS[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="템플릿" hint="선택하면 기본 필드와 서식이 자동으로 채워집니다.">
          {({ id }) => (
            <Select
              id={id}
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const template = templates.find((t) => t.id === e.target.value);
                if (template) setType(template.card_type);
              }}
            >
              <option value="">사용 안 함</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="flex items-start gap-1.5 rounded-lg bg-[var(--color-surface-2)] p-2.5 text-xs text-[var(--color-fg-muted)]">
          <Sparkles aria-hidden className="mt-0.5 h-3.5 w-3.5" />새 카드는 항상 <strong>비공개</strong>로 만들어집니다. 준비가 되면 공개
          범위를 설정하세요.
        </p>
      </div>
    </Dialog>
  );
}
