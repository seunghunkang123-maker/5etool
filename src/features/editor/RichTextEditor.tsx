import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react';
import type { RichDoc } from '@/data/types';
import { cn } from '@/lib/cn';
import { sanitizeHtml } from '@/domain/sanitize';

/**
 * 리치 텍스트 편집기 (TipTap).
 * 문서는 JSON으로 저장하고, HTML로 렌더링할 때는 항상 정화한다.
 * 무거운 의존성이므로 지연 로딩해서 사용한다.
 */

interface RichTextEditorProps {
  value: RichDoc | null;
  onChange: (doc: RichDoc) => void;
  placeholder?: string;
  editable?: boolean;
  label: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, editable = true, label, className }: RichTextEditorProps) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] }),
      Placeholder.configure({ placeholder: placeholder ?? '내용을 입력하세요…' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: (value ?? undefined) as JSONContent | undefined,
    editorProps: {
      attributes: {
        class: 'prose-app min-h-40 px-3 py-2 focus:outline-none',
        'aria-label': label,
      },
      // 붙여넣은 HTML은 저장 전에 정화한다.
      transformPastedHTML: (html) => sanitizeHtml(html),
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON() as RichDoc);
    },
  });

  // 외부에서 문서가 교체되면(다른 카드 선택 등) 내용을 갱신한다.
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(value ?? { type: 'doc', content: [] });
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent((value ?? { type: 'doc', content: [] }) as JSONContent, false);
    }
  }, [value, editor]);

  if (!editor) return <div className="h-40 animate-soft-pulse rounded-lg bg-[var(--color-surface-3)]" aria-hidden />;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]', className)}>
      {editable ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const button = (opts: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) => (
    <button
      type="button"
      aria-label={opts.label}
      aria-pressed={opts.active}
      title={opts.label}
      onClick={opts.onClick}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-3)]',
        opts.active && 'bg-[var(--color-surface-3)] text-[var(--color-accent)]',
      )}
    >
      {opts.icon}
    </button>
  );

  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    // 브라우저 prompt를 쓰지 않고, 선택 영역이 있으면 링크 토글만 수행한다.
    if (previous) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const selected = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to);
    if (!selected) return;
    if (/^https?:\/\//i.test(selected)) {
      editor.chain().focus().setLink({ href: selected }).run();
    }
  };

  return (
    <div role="toolbar" aria-label="서식" className="flex flex-wrap items-center gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-1">
      {button({ icon: <Heading1 aria-hidden className="h-4 w-4" />, label: '제목', active: editor.isActive('heading', { level: 1 }), onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() })}
      {button({ icon: <Heading2 aria-hidden className="h-4 w-4" />, label: '소제목', active: editor.isActive('heading', { level: 2 }), onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() })}
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      {button({ icon: <Bold aria-hidden className="h-4 w-4" />, label: '굵게', active: editor.isActive('bold'), onClick: () => editor.chain().focus().toggleBold().run() })}
      {button({ icon: <Italic aria-hidden className="h-4 w-4" />, label: '기울임', active: editor.isActive('italic'), onClick: () => editor.chain().focus().toggleItalic().run() })}
      {button({ icon: <UnderlineIcon aria-hidden className="h-4 w-4" />, label: '밑줄', active: editor.isActive('underline'), onClick: () => editor.chain().focus().toggleUnderline().run() })}
      {button({ icon: <Strikethrough aria-hidden className="h-4 w-4" />, label: '취소선', active: editor.isActive('strike'), onClick: () => editor.chain().focus().toggleStrike().run() })}
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      {button({ icon: <List aria-hidden className="h-4 w-4" />, label: '글머리표', active: editor.isActive('bulletList'), onClick: () => editor.chain().focus().toggleBulletList().run() })}
      {button({ icon: <ListOrdered aria-hidden className="h-4 w-4" />, label: '번호 목록', active: editor.isActive('orderedList'), onClick: () => editor.chain().focus().toggleOrderedList().run() })}
      {button({ icon: <ListChecks aria-hidden className="h-4 w-4" />, label: '체크리스트', active: editor.isActive('taskList'), onClick: () => editor.chain().focus().toggleTaskList().run() })}
      {button({ icon: <Quote aria-hidden className="h-4 w-4" />, label: '인용', active: editor.isActive('blockquote'), onClick: () => editor.chain().focus().toggleBlockquote().run() })}
      {button({ icon: <Code aria-hidden className="h-4 w-4" />, label: '코드 블록', active: editor.isActive('codeBlock'), onClick: () => editor.chain().focus().toggleCodeBlock().run() })}
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      {button({ icon: <Minus aria-hidden className="h-4 w-4" />, label: '구분선', onClick: () => editor.chain().focus().setHorizontalRule().run() })}
      {button({ icon: <TableIcon aria-hidden className="h-4 w-4" />, label: '표 삽입', onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() })}
      {button({ icon: <Link2 aria-hidden className="h-4 w-4" />, label: '링크', active: editor.isActive('link'), onClick: addLink })}
      <span aria-hidden className="mx-1 h-5 w-px bg-[var(--color-border)]" />
      {button({ icon: <Undo2 aria-hidden className="h-4 w-4" />, label: '실행 취소', onClick: () => editor.chain().focus().undo().run() })}
      {button({ icon: <Redo2 aria-hidden className="h-4 w-4" />, label: '다시 실행', onClick: () => editor.chain().focus().redo().run() })}
    </div>
  );
}
