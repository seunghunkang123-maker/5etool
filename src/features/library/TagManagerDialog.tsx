import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { repo } from '@/data';
import { qk, useCards, useTags } from '@/hooks/queries';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/feedback';
import { toast } from '@/components/ui/Toast';
import { confirmAndRun } from '@/components/ui/ConfirmDialog';
import { runOrToast, toUserMessage } from '@/lib/errors';
import type { Tag, UUID } from '@/data/types';

/** 새 태그에 돌아가며 쓰는 기본 색. 직접 고칠 수도 있다. */
const DEFAULT_COLORS = ['#7c5cff', '#e0567a', '#3fa66a', '#d98324', '#3a86c8', '#8a5cd1', '#c2503f', '#4d8f8f'];

/**
 * 태그 관리.
 *
 * 태그를 만들고, 이름과 색을 고치고, 지운다.
 * 지우면 그 태그가 붙어 있던 카드에서도 함께 떨어지므로 몇 장에 붙어 있는지 미리 알려 준다.
 */
export function TagManagerDialog({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const client = useQueryClient();
  const { data: tags = [], error } = useTags(campaignId);
  // 태그별 사용 개수를 세기 위해 카드 전체를 본다(보관함 화면이 이미 쓰는 질의라 추가 요청이 없다).
  const { data: cards = [] } = useCards(campaignId, undefined);

  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const usageOf = (tagId: UUID) => cards.filter((card) => (card.tag_ids ?? []).includes(tagId)).length;

  const refresh = () => {
    void client.invalidateQueries({ queryKey: qk.tags(campaignId) });
    void client.invalidateQueries({ queryKey: ['cards', campaignId] });
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (tags.some((tag) => tag.name === name)) {
      toast.warning('같은 이름의 태그가 이미 있습니다.');
      return;
    }
    setBusy(true);
    const color = DEFAULT_COLORS[tags.length % DEFAULT_COLORS.length] ?? '#7c5cff';
    const ok = await runOrToast(() => repo().library.createTag(campaignId, name, color), toast.error, '태그를 만들지 못했습니다.');
    setBusy(false);
    if (!ok) return;
    setNewName('');
    refresh();
    toast.success(`"${name}" 태그를 만들었습니다.`);
  };

  const remove = (tag: Tag) => {
    const used = usageOf(tag.id);
    void confirmAndRun(
      {
        title: `"${tag.name}" 태그를 삭제할까요?`,
        description:
          used > 0
            ? `카드 ${used}장에서 이 태그가 함께 떨어집니다. 카드 자체는 지워지지 않으며, 되돌릴 수 없습니다.`
            : '되돌릴 수 없습니다. 카드 자체는 지워지지 않습니다.',
        confirmLabel: '삭제',
        danger: true,
      },
      async () => {
        await repo().library.deleteTag(tag.id);
        refresh();
      },
      '태그를 삭제했습니다.',
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="태그 관리"
      footer={
        <Button variant="primary" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
            {toUserMessage(error, '태그를 불러오지 못했습니다.')}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <Field label="새 태그 이름" className="flex-1">
            {({ id }) => (
              <Input
                id={id}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="예: 1막"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void create();
                }}
              />
            )}
          </Field>
          <Button variant="primary" loading={busy} disabled={!newName.trim()} onClick={() => void create()}>
            <Plus aria-hidden className="h-4 w-4" />
            추가
          </Button>
        </div>

        {tags.length === 0 ? (
          <EmptyState title="아직 태그가 없습니다" description="태그를 만들면 카드를 주제별로 묶어 찾을 수 있습니다." />
        ) : (
          <ul className="flex flex-col gap-2">
            {tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} usage={usageOf(tag.id)} onChanged={refresh} onDelete={() => remove(tag)} />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function TagRow({ tag, usage, onChanged, onDelete }: { tag: Tag; usage: number; onChanged: () => void; onDelete: () => void }) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  const save = async (patch: Partial<Tag>) => {
    const ok = await runOrToast(() => repo().library.updateTag(tag.id, patch), toast.error, '태그를 저장하지 못했습니다.');
    if (ok) onChanged();
  };

  return (
    <li className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] p-2">
      <label className="sr-only" htmlFor={`tag-color-${tag.id}`}>
        {tag.name} 색
      </label>
      <input
        id={`tag-color-${tag.id}`}
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={() => color !== tag.color && void save({ color })}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-transparent"
      />

      <label className="sr-only" htmlFor={`tag-name-${tag.id}`}>
        {tag.name} 이름
      </label>
      <Input
        id={`tag-name-${tag.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== tag.name && void save({ name: name.trim() })}
        className="min-w-0 flex-1"
      />

      <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">{usage > 0 ? `카드 ${usage}장` : '사용 안 함'}</span>

      <Button size="sm" variant="ghost" aria-label={`${tag.name} 태그 삭제`} onClick={onDelete}>
        <Trash2 aria-hidden className="h-4 w-4" />
      </Button>
    </li>
  );
}
