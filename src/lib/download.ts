/** 브라우저에서 파일을 내려받는다. */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  triggerDownload(new Blob([text], { type: mime }), filename);
}

/**
 * 인쇄용 창을 띄운다. (PDF는 브라우저 인쇄 대화상자의 "PDF로 저장"을 사용)
 * 별도 PDF 라이브러리를 번들에 넣지 않기 위한 선택이다.
 */
export function printHtml(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank', 'width=900,height=1200');
  if (!win) return;
  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, 'Malgun Gothic', sans-serif; line-height: 1.7; padding: 32px; max-width: 800px; margin: 0 auto; color: #111; }
      h1 { font-size: 1.6rem; border-bottom: 2px solid #333; padding-bottom: 8px; }
      h2 { font-size: 1.25rem; margin-top: 1.5rem; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
      img { max-width: 100%; }
      @media print { body { padding: 0; } }
    </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}
