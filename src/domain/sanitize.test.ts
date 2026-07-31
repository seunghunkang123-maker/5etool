import { describe, expect, it } from 'vitest';
import {
  docToHtml,
  docToMarkdown,
  docToPlainText,
  escapeHtml,
  htmlToPlainText,
  plainTextToDoc,
  sanitizeHtml,
  textOrHtmlToHtml,
} from './sanitize';

describe('sanitizeHtml', () => {
  it('script 태그를 제거한다', () => {
    const result = sanitizeHtml('<p>안녕</p><script>alert(1)</script>');
    expect(result).toContain('안녕');
    expect(result).not.toContain('script');
  });

  it('이벤트 핸들러 속성을 제거한다', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)" />');
    expect(result).not.toContain('onerror');
  });

  it('javascript: URI를 제거한다', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">클릭</a>');
    expect(result).not.toContain('javascript:');
  });

  it('허용된 서식은 유지한다', () => {
    const result = sanitizeHtml('<p><strong>굵게</strong> <em>기울임</em> <u>밑줄</u></p>');
    expect(result).toContain('<strong>굵게</strong>');
    expect(result).toContain('<em>기울임</em>');
  });

  it('표와 목록을 유지한다', () => {
    const result = sanitizeHtml('<table><tr><td>칸</td></tr></table><ul><li>항목</li></ul>');
    expect(result).toContain('<td>칸</td>');
    expect(result).toContain('<li>항목</li>');
  });

  it('iframe과 form을 제거한다', () => {
    const result = sanitizeHtml('<iframe src="https://evil.test"></iframe><form><input /></form>');
    expect(result).not.toContain('iframe');
    expect(result).not.toContain('<input');
  });

  it('style 속성을 제거한다', () => {
    expect(sanitizeHtml('<p style="position:fixed">x</p>')).not.toContain('style');
  });

  it('빈 입력을 안전하게 처리한다', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('escapeHtml', () => {
  it('HTML 특수문자를 escape 한다', () => {
    expect(escapeHtml('<script>&"\'')).toBe('&lt;script&gt;&amp;&quot;&#39;');
  });
});

describe('docToPlainText', () => {
  it('리치 텍스트에서 순수 텍스트를 뽑는다', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '첫 문단' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '둘째 문단' }] },
      ],
    };
    expect(docToPlainText(doc)).toContain('첫 문단');
    expect(docToPlainText(doc)).toContain('둘째 문단');
  });

  it('null을 빈 문자열로 처리한다', () => {
    expect(docToPlainText(null)).toBe('');
  });
});

describe('plainTextToDoc', () => {
  it('줄바꿈을 문단으로 만든다', () => {
    const doc = plainTextToDoc('첫 줄\n둘째 줄');
    expect(doc.content).toHaveLength(2);
    expect(docToPlainText(doc)).toContain('둘째 줄');
  });
});

describe('docToHtml', () => {
  it('마크와 노드를 HTML로 변환한다', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '제목' }] },
        { type: 'paragraph', content: [{ type: 'text', text: '굵게', marks: [{ type: 'bold' }] }] },
      ],
    };
    const html = docToHtml(doc);
    expect(html).toContain('<h2>제목</h2>');
    expect(html).toContain('<strong>굵게</strong>');
  });

  it('본문에 포함된 HTML을 escape 한다 (XSS 방어)', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }],
    };
    const html = docToHtml(doc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('링크의 javascript: URI를 제거한다', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '클릭', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }],
        },
      ],
    };
    expect(docToHtml(doc)).not.toContain('javascript:');
  });
});

describe('docToMarkdown', () => {
  it('Markdown으로 변환한다', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '제목' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목' }] }] }] },
      ],
    };
    const md = docToMarkdown(doc);
    expect(md).toContain('# 제목');
    expect(md).toContain('- 항목');
  });
});

describe('textOrHtmlToHtml', () => {
  it('평문 줄바꿈을 문단과 <br>로 바꾼다', () => {
    const html = textOrHtmlToHtml('첫 줄\n둘째 줄\n\n다음 문단');
    expect(html).toContain('<p>첫 줄<br>둘째 줄</p>');
    expect(html).toContain('<p>다음 문단</p>');
  });

  it('평문에 든 꺾쇠는 태그로 해석하지 않는다', () => {
    const html = textOrHtmlToHtml('명중 <10 이면 실패');
    expect(html).toContain('&lt;10');
    expect(html).not.toContain('<10');
  });

  it('이미 HTML이면 그대로 두되 정화한다', () => {
    const html = textOrHtmlToHtml('<p><strong>굵게</strong></p>');
    expect(html).toContain('<strong>굵게</strong>');
  });

  it('HTML 안의 스크립트는 제거한다', () => {
    const html = textOrHtmlToHtml('<p>안녕<script>alert(1)</script></p>');
    expect(html).not.toContain('script');
    expect(html).toContain('안녕');
  });

  it('빈 값은 빈 문자열', () => {
    expect(textOrHtmlToHtml('')).toBe('');
    expect(textOrHtmlToHtml(null)).toBe('');
    expect(textOrHtmlToHtml('   ')).toBe('');
  });
});

describe('htmlToPlainText', () => {
  it('태그를 걷어내고 줄바꿈으로 바꾼다', () => {
    expect(htmlToPlainText('<p>첫 줄</p><p>둘째 줄</p>')).toBe('첫 줄\n둘째 줄');
  });

  it('서식 태그 안의 글자를 살린다', () => {
    expect(htmlToPlainText('<p><strong>굵은</strong> 글씨</p>')).toBe('굵은 글씨');
  });

  it('빈 값은 빈 문자열', () => {
    expect(htmlToPlainText(null)).toBe('');
  });
});
