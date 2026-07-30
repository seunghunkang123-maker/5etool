/**
 * 앱 상징 아이콘 — 20면체 주사위(d20).
 *
 * 정육각형 외곽에 삼각면 하나를 겹친 형태다.
 * 16px에서도 형태가 뭉치지 않도록 선 수를 최소로 유지했다.
 * public/favicon.svg가 같은 도형을 쓴다. 한쪽을 고치면 다른 쪽도 함께 고칠 것.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {/* 주사위 외곽 */}
      <path d="M12 2.4 20.6 7.2v9.6L12 21.6 3.4 16.8V7.2Z" />
      {/* 위쪽 삼각면 */}
      <path d="M12 6.6 16.9 15H7.1Z" />
    </svg>
  );
}
