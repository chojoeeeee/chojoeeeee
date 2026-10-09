import Link from "next/link";
import { WatchlistCard } from "@/components/WatchlistCard";
import { loadViews } from "@/features/watchlist/page-data";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const now = new Date();
  const views = await loadViews(now);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">추적 목록</h1>
      {views.length === 0 ? (
        <div className="rounded-2xl bg-soft p-8 text-center">
          <p className="font-bold">아직 추적 중인 항공권이 없어요</p>
          <p className="mt-1 text-sm text-muted">항공권을 검색하고 가격 알림을 받아보세요.</p>
          <Link href="/" className="mt-4 inline-flex h-12 items-center rounded-xl bg-brand px-6 font-bold text-white">항공권 검색하기</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {views.map((v) => <WatchlistCard key={v.watchlist.id} view={v} now={now.getTime()} />)}
        </div>
      )}
    </div>
  );
}
