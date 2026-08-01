import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Code, Italic, List, ListOrdered, Strikethrough, Underline as UnderlineIcon } from 'lucide-react';
import { sanitizeHtml, textOrHtmlToHtml } from '@/domain/sanitize';
import { cn } from '@/lib/cn';

/**
 * 짧은 서식 입력 칸.
 *
 * 특성·행동 설명이나 장비 목록처럼 원래 평문이던 칸에 굵게·기울임 정도의 서식을
 * 넣기 위한 것이다. 카드 본문에 쓰는 RichTextEditor와 달리 제목·표·링크는 없다.
 *
 * 값은 정화된 HTML 문자열로 주고받는다. 저장 위치가 text 열이라 스키마를 바꾸지 않고
 * 기존 평문 데이터와 그대로 섞여 쓸 수 있다. 들어올 때와 나갈 때 모두 정화한다.
 */
export function InlineRichText({
  value,
  onChange,
  placeholder,
  rows = 3,
  ariaLabel,
  editable = true,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 최소 높이를 줄 수로 지정한다. */
  rows?: number;
  ariaLabel?: string;
  editable?: boolean;
}) {
  const editor = useEditor({
    editable,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    content: textOrHtmlToHtml(value),
    editorProps: {
      attributes: {
        class: 'prose-app focus:outline-none',
        ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => {
      const html = instance.getHTML();
      // 빈 문서는 <p></p>로 나온다. 빈 값으로 저장해 "내용 있음"으로 보이지 않게 한다.
      onChange(instance.getText().trim() ? sanitizeHtml(html) : '');
    },
  });

  // 바깥에서 값이 바뀌면(다른 카드 선택 등) 편집기 내용을 맞춘다.
  //
  // 편집 중에는 절대 건드리지 않는다. 내용을 다시 넣으면 커서가 처음으로 돌아가고,
  // 한글 조합 중이면 조합까지 끊겨 휴대폰에서 커서가 튄다.
  // isFocused만으로는 부족하다. 조합 중에 잠깐 포커스가 빠진 것으로 보고되는
  // 경우가 있어 조합 상태도 함께 본다.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused || editor.view.composing) return;
    const next = textOrHtmlToHtml(value);
    if (next !== editor.getHTML()) editor.commands.setContent(next, false);
  }, [editor, value]);

  if (!editor) {
    return <div className="rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-fg-muted)]">편집기를 불러오는 중…</div>;
  }

  const buttons = [
    { icon: Bold, label: '굵게', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
    { icon: Italic, label: '기울임', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
    { icon: UnderlineIcon, label: '밑줄', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline') },
    { icon: Strikethrough, label: '취소선', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike') },
    { icon: Code, label: '코드', action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code') },
    { icon: List, label: '글머리 목록', action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList') },
    { icon: ListOrdered, label: '번호 목록', action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList') },
  ];

  return (
    <div className="rounded-lg border border-[var(--color-border)] focus-within:border-[var(--color-accent)]">
      {editable ? (
        <div className="flex flex-wrap gap-0.5 border-b border-[var(--color-border)] p-1">
          {buttons.map(({ icon: Icon, label, action, active }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={active}
              onClick={action}
              className={cn(
                'rounded p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-fg)]',
                active && 'bg-[var(--color-surface-3)] text-[var(--color-fg)]',
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
            </button>
          ))}
          <span className="ml-auto self-center pr-2 text-[10px] text-[var(--color-fg-muted)]">
            Ctrl+B · Ctrl+I
          </span>
        </div>
      ) : null}

      <EditorContent editor={editor} className="px-3 py-2" style={{ minHeight: `${rows * 1.6 + 1}rem` }} />
    </div>
  );
}
