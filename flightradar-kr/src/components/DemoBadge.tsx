/** User-facing marker for test (DEMO) data. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ${className}`}>테스트 데이터</span>;
}
