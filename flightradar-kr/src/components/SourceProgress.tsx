import type { SourceInfo, SourceResult } from "@/features/flight-search/result";

const DONE_OK = ["ok", "deals_only"];

export function SourceProgress({ sources, results }: { sources: SourceInfo[]; results: Record<string, SourceResult | undefined> }) {
  const finished = sources.filter((s) => results[s.name]).length;
  return (
    <section aria-live="polite" className="rounded-2xl border border-line bg-card p-5">
      <p className="font-semibold">{sources.length}개 사이트에서 가격을 찾고 있습니다.</p>
      <p className="text-xs text-muted">{finished}/{sources.length} 완료</p>
      <ul className="mt-3 divide-y divide-line">
        {sources.map((s) => {
          const r = results[s.name];
          return (
            <li key={s.name} className="flex items-center justify-between py-2 text-sm">
              <span>{s.displayName}</span>
              {!r ? (
                <span className="flex items-center gap-2 text-muted"><span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />검색 중...</span>
              ) : DONE_OK.includes(r.run.status) ? (
                <span className="text-green-700">검색 완료 ✓</span>
              ) : (
                <span className="text-amber-700">확인 필요 ⚠</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
