import DOMPurify from 'dompurify';
import type { RichDoc } from '@/data/types';

/**
 * HTML 정화 및 리치 텍스트 변환.
 * 저장 시점과 렌더링 시점 양쪽에서 정화하여 XSS를 막는다.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
];

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'colspan', 'rowspan', 'class', 'data-type', 'data-checked'];

/**
 * 신뢰할 수 없는 HTML을 정화한다.
 * - script/style/이벤트 핸들러 제거
 * - javascript:, data: (이미지 제외) URI 제거
 * - 외부 링크에 rel="noopener noreferrer" 강제
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  const clean = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style', 'formaction'],
    USE_PROFILES: { html: true },
  });
  return typeof clean === 'string' ? clean : String(clean);
}

let hookInstalled = false;

/** 링크 안전 속성 훅을 설치한다(앱 부팅 시 1회). */
export function installSanitizerHooks(): void {
  if (hookInstalled) return;
  if (typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof Element && node.tagName === 'A') {
      node.setAttribute('rel', 'noopener noreferrer');
      node.setAttribute('target', '_blank');
    }
  });
  hookInstalled = true;
}

/** 사용자가 입력한 일반 텍스트에서 HTML 특수문자를 escape 한다. */
export function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── TipTap JSON ↔ 텍스트/HTML ─────────────────────────────────

interface DocNode {
  type?: string;
  text?: string;
  content?: DocNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

/** 리치 텍스트 문서에서 순수 텍스트를 뽑아낸다(검색·요약용). */
export function docToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc) return '';
  const parts: string[] = [];
  const walk = (node: DocNode) => {
    if (typeof node.text === 'string') parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach((child) => walk(child as DocNode));
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') parts.push('\n');
  };
  walk(doc as DocNode);
  return parts.join('').replace(/\n{2,}/g, '\n').trim();
}

/** 일반 텍스트를 최소한의 TipTap 문서로 변환한다. */
export function plainTextToDoc(text: string): RichDoc {
  const lines = String(text ?? '').split(/\r?\n/);
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}

const MARK_TAGS: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strike: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
};

/**
 * TipTap JSON을 HTML로 변환한다(내보내기/인쇄용).
 * 결과는 항상 sanitizeHtml을 통과시킨다.
 */
export function docToHtml(doc: RichDoc | null | undefined): string {
  if (!doc) return '';
  const render = (node: DocNode): string => {
    if (node.type === 'text') {
      let out = escapeHtml(node.text ?? '');
      for (const mark of node.marks ?? []) {
        if (mark.type === 'link') {
          const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '#';
          out = `<a href="${escapeHtml(href)}">${out}</a>`;
        } else {
          const pair = MARK_TAGS[mark.type];
          if (pair) out = `${pair[0]}${out}${pair[1]}`;
        }
      }
      return out;
    }
    const inner = (node.content ?? []).map(render).join('');
    switch (node.type) {
      case 'doc':
        return inner;
      case 'paragraph':
        return `<p>${inner}</p>`;
      case 'heading': {
        const level = Number(node.attrs?.level ?? 1);
        const tag = `h${Math.min(4, Math.max(1, level))}`;
        return `<${tag}>${inner}</${tag}>`;
      }
      case 'bulletList':
        return `<ul>${inner}</ul>`;
      case 'orderedList':
        return `<ol>${inner}</ol>`;
      case 'taskList':
        return `<ul class="task-list">${inner}</ul>`;
      case 'listItem':
      case 'taskItem':
        return `<li>${inner}</li>`;
      case 'blockquote':
        return `<blockquote>${inner}</blockquote>`;
      case 'codeBlock':
        return `<pre><code>${inner}</code></pre>`;
      case 'horizontalRule':
        return '<hr />';
      case 'hardBreak':
        return '<br />';
      case 'table':
        return `<table>${inner}</table>`;
      case 'tableRow':
        return `<tr>${inner}</tr>`;
      case 'tableHeader':
        return `<th>${inner}</th>`;
      case 'tableCell':
        return `<td>${inner}</td>`;
      case 'image': {
        const src = typeof node.attrs?.src === 'string' ? node.attrs.src : '';
        const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" />`;
      }
      default:
        return inner;
    }
  };
  return sanitizeHtml(render(doc as DocNode));
}

/** 리치 텍스트를 Markdown으로 변환한다(내보내기용). */
export function docToMarkdown(doc: RichDoc | null | undefined): string {
  if (!doc) return '';
  const render = (node: DocNode, depth = 0): string => {
    if (node.type === 'text') {
      let out = node.text ?? '';
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') out = `**${out}**`;
        else if (mark.type === 'italic') out = `*${out}*`;
        else if (mark.type === 'code') out = `\`${out}\``;
        else if (mark.type === 'strike') out = `~~${out}~~`;
        else if (mark.type === 'link') out = `[${out}](${String(mark.attrs?.href ?? '')})`;
      }
      return out;
    }
    const children = (node.content ?? []).map((c) => render(c, depth + 1));
    switch (node.type) {
      case 'doc':
        return children.join('\n\n');
      case 'paragraph':
        return children.join('');
      case 'heading':
        return `${'#'.repeat(Math.min(6, Number(node.attrs?.level ?? 1)))} ${children.join('')}`;
      case 'bulletList':
        return children.map((c) => `- ${c}`).join('\n');
      case 'orderedList':
        return children.map((c, i) => `${i + 1}. ${c}`).join('\n');
      case 'listItem':
      case 'taskItem':
        return children.join('');
      case 'blockquote':
        return children.map((c) => `> ${c}`).join('\n');
      case 'codeBlock':
        return `\`\`\`\n${children.join('')}\n\`\`\``;
      case 'horizontalRule':
        return '---';
      case 'hardBreak':
        return '\n';
      default:
        return children.join('');
    }
  };
  return render(doc as DocNode).trim();
}

/**
 * 서식을 지원하기 전에 저장된 평문을 HTML로 올린다.
 *
 * 특성·장비 같은 칸은 원래 평문이었다. 서식 편집기로 바꾸면서 기존 값을 그대로
 * 넣으면 줄바꿈이 사라지고, 값에 `<`가 들어 있으면 태그로 오해된다.
 * 태그가 없어 보이면 평문으로 보고 이스케이프한 뒤 줄바꿈을 <br>로 바꾼다.
 */
export function textOrHtmlToHtml(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  // 우리가 허용하는 태그가 하나라도 있으면 이미 HTML로 저장된 값이다.
  const looksLikeHtml = /<(\/?)(p|br|strong|b|em|i|u|s|del|code|ul|ol|li|blockquote|h[1-4]|span)\b/i.test(raw);
  if (looksLikeHtml) return sanitizeHtml(raw);

  const paragraphs = raw
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return sanitizeHtml(paragraphs);
}

/** 서식이 있는 값에서 순수 텍스트만 뽑는다. 검색과 미리보기에 쓴다. */
export function htmlToPlainText(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  return sanitizeHtml(raw)
    .replace(/<\/(p|div|li|h[1-4]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
