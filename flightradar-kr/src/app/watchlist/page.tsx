import Link from "next/link";
import { WatchlistCard } from "@/components/WatchlistCard";
import { backgroundNote, isDemoMode, loadViews, sourceNames, storeKind } from "@/features/watchlist/page-data";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const now = new Date();
  const views = await loadViews(now);
  const note = backgroundNote(now);
  const demo = isDemoMode();
  const names = sourceNames();
  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">추적 중인 항공권</h1>
          <p className="text-xs text-muted">{views.length}개 · 가격이 기록되고 목표가에 닿으면 알려드려요.</p>
        </div>
        <Link href="/settings/notifications" className="text-xs text-brand underline">알림 설정</Link>
      </header>

      {storeKind() === "memory" && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          DATABASE_URL이 없어 <strong>임시 메모리 저장소</strong>를 쓰고 있어요. 서버를 다시 시작하면 추적 목록과 가격 기록이 사라집니다. (README의 Supabase 설정 참고)
        </p>
      )}

      {views.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center text-sm text-muted">
          <p className="font-semibold text-fg">아직 추적 중인 항공권이 없어요.</p>
          <p className="mt-1">항공권을 검색하고 &lsquo;🔔 이 가격 추적하기&rsquo;를 눌러보세요.</p>
          <Link href="/" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-white">항공권 검색하기</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {views.map((v) => (
            <WatchlistCard key={v.watchlist.id} view={v} backgroundNote={note} demoMode={demo} now={now.getTime()} names={names} />
          ))}
        </div>
      )}
    </div>
  );
}
