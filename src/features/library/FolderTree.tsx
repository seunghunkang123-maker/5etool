import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, FolderPlus, Folder as FolderIcon, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { Folder, UUID } from '@/data/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

interface FolderTreeProps {
  folders: Folder[];
  selectedId: UUID | null | undefined;
  onSelect: (folderId: UUID | null | undefined) => void;
  canEdit: boolean;
  onCreate: (parentId: UUID | null) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  counts: Record<string, number>;
}

export function FolderTree({ folders, selectedId, onSelect, canEdit, onCreate, onRename, onDelete, counts }: FolderTreeProps) {
  const roots = folders.filter((f) => !f.parent_id);

  return (
    <nav aria-label="폴더" className="flex flex-col gap-0.5">
      <FolderRow
        id="__all__"
        label="전체 자료"
        count={Object.values(counts).reduce((sum, n) => sum + n, 0)}
        depth={0}
        selected={selectedId === undefined}
        onSelect={() => onSelect(undefined)}
        droppableId={null}
      />
      <FolderRow
        id="__unfiled__"
        label="미분류"
        count={counts.__unfiled__ ?? 0}
        depth={0}
        selected={selectedId === null}
        onSelect={() => onSelect(null)}
        droppableId="__unfiled__"
      />

      {roots.map((folder) => (
        <FolderNode
          key={folder.id}
          folder={folder}
          folders={folders}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          canEdit={canEdit}
          onCreate={onCreate}
          onRename={onRename}
          onDelete={onDelete}
          counts={counts}
        />
      ))}

      {canEdit ? (
        <Button variant="subtle" size="sm" className="mt-1 justify-start" onClick={() => onCreate(null)}>
          <FolderPlus aria-hidden className="h-4 w-4" />새 폴더
        </Button>
      ) : null}
    </nav>
  );
}

function FolderNode({
  folder,
  folders,
  depth,
  selectedId,
  onSelect,
  canEdit,
  onCreate,
  onRename,
  onDelete,
  counts,
}: {
  folder: Folder;
  depth: number;
} & Omit<FolderTreeProps, 'folders'> & { folders: Folder[] }) {
  const [expanded, setExpanded] = useState(true);
  const children = folders.filter((f) => f.parent_id === folder.id);

  return (
    <div>
      <FolderRow
        id={folder.id}
        label={folder.name}
        count={counts[folder.id] ?? 0}
        depth={depth}
        selected={selectedId === folder.id}
        onSelect={() => onSelect(folder.id)}
        droppableId={folder.id}
        color={folder.color}
        hasChildren={children.length > 0}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        actions={
          canEdit ? (
            <FolderMenu
              onCreateChild={() => onCreate(folder.id)}
              onRename={() => onRename(folder)}
              onDelete={() => onDelete(folder)}
              folderName={folder.name}
            />
          ) : null
        }
      />
      {expanded
        ? children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              canEdit={canEdit}
              onCreate={onCreate}
              onRename={onRename}
              onDelete={onDelete}
              counts={counts}
            />
          ))
        : null}
    </div>
  );
}

function FolderRow({
  id,
  label,
  count,
  depth,
  selected,
  onSelect,
  droppableId,
  color,
  hasChildren,
  expanded,
  onToggle,
  actions,
}: {
  id: string;
  label: string;
  count: number;
  depth: number;
  selected: boolean;
  onSelect: () => void;
  droppableId: string | null;
  color?: string | null;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  actions?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${droppableId ?? 'none'}`, disabled: droppableId === null && id === '__all__' });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1',
        selected && 'bg-[var(--color-accent)]/12',
        isOver && 'ring-2 ring-[var(--color-accent)]',
      )}
      style={{ paddingLeft: `${depth * 12}px` }}
    >
      {hasChildren ? (
        <button type="button" onClick={onToggle} aria-label={expanded ? `${label} 접기` : `${label} 펼치기`} className="p-1 text-[var(--color-fg-muted)]">
          {expanded ? <ChevronDown aria-hidden className="h-4 w-4" /> : <ChevronRight aria-hidden className="h-4 w-4" />}
        </button>
      ) : (
        <span aria-hidden className="w-6" />
      )}

      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-sm"
      >
        <FolderIcon aria-hidden className="h-4 w-4 shrink-0" style={color ? { color } : undefined} />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-xs text-[var(--color-fg-muted)]">{count}</span>
      </button>

      {actions}
    </div>
  );
}

function FolderMenu({
  onCreateChild,
  onRename,
  onDelete,
  folderName,
}: {
  onCreateChild: () => void;
  onRename: () => void;
  onDelete: () => void;
  folderName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`${folderName} 폴더 메뉴`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1 text-[var(--color-fg-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <MoreVertical aria-hidden className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <button type="button" aria-label="메뉴 닫기" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg">
            <MenuButton icon={<FolderPlus aria-hidden className="h-4 w-4" />} label="하위 폴더 추가" onClick={() => { setOpen(false); onCreateChild(); }} />
            <MenuButton icon={<Pencil aria-hidden className="h-4 w-4" />} label="이름 변경" onClick={() => { setOpen(false); onRename(); }} />
            <MenuButton icon={<Trash2 aria-hidden className="h-4 w-4" />} label="삭제" onClick={() => { setOpen(false); onDelete(); }} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--color-surface-2)]"
    >
      {icon}
      {label}
    </button>
  );
}
