import type { SearchResult } from "@/features/flight-search/engine";

const LABEL: Record<string, string> = { ok: "완료", error: "오류", timeout: "시간 초과", unavailable: "연결 안 됨" };

export function ProviderStatusBar({ result }: { result: SearchResult }) {
  const { total, succeeded } = result.summary;
  return (
    <details className="rounded-xl border border-line bg-card px-4 py-2 text-sm">
      <summary className="cursor-pointer">
        {total}개 서비스 중 <strong>{succeeded}개</strong> 가격 확인 완료
        {succeeded < total && <span className="text-amber-700"> · 일부 서비스는 응답하지 못했어요</span>}
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {result.providers.map((p) => (
          <li key={p.provider}>
            {p.displayName}: {LABEL[p.status]} · {p.offerCount}건 · {p.elapsedMs}ms{p.cached ? " (캐시)" : ""}
            {p.isDemo && " · DEMO"}
            {p.excluded && " · 실제 데이터가 있어 비교에서 제외"}
            {p.error && ` · ${p.error}`}
          </li>
        ))}
      </ul>
    </details>
  );
}
