import Link from "next/link";
import { notFound } from "next/navigation";
import { ChangeText, Stat } from "@/components/WatchlistCard";
import { DemoBadge } from "@/components/DemoBadge";
import { PriceChart } from "@/components/PriceChart";
import { WatchlistActions } from "@/components/WatchlistActions";
import { placeName } from "@/config/airports";
import { buildChartData } from "@/features/watchlist/chart-data";
import { sourceNames } from "@/features/watchlist/page-data";
import { getStore, ownerId } from "@/features/watchlist/service";
import { buildView } from "@/features/watchlist/view";
import { formatKrw, formatMonthDay, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const ALERT_LABEL = { TARGET_REACHED: "목표가 도달", PRICE_DROP: "가격 하락", NEW_LOWEST: "새 최저가", RELATED_DEAL: "관련 특가" } as const;

export default async function WatchlistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const w = await store.getWatchlist(id);
  if (!w || w.userId !== ownerId()) notFound();

  const now = new Date();
  const [rows, alerts] = await Promise.all([store.listPriceHistory(w.id), store.listAlertHistory({ watchlistId: w.id, limit: 5 })]);
  const view = buildView(w, rows, now);
  const chart = buildChartData(rows, sourceNames());
  const { stats } = view;
  const cur = stats.current;

  return (
    <div className="space-y-5">
      <Link href="/watchlist" className="text-xs font-medium text-muted">← 추적 목록</Link>
      <header>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
          {placeName(w.origin)} → {placeName(w.destination)}
          {cur?.isDemo && <DemoBadge />}
        </h1>
        <p className="text-sm text-muted">{formatMonthDay(w.departureDate)}{w.returnDate && ` ~ ${formatMonthDay(w.returnDate)}`} · 성인 {w.adults}명</p>
      </header>

      <section className="grid grid-cols-2 gap-4 rounded-2xl border border-line bg-white p-4">
        <Stat label="현재 가격 (1인)" value={cur ? formatKrw(cur.price) : "-"} />
        <Stat label="목표 가격" value={w.targetPrice !== undefined ? formatKrw(w.targetPrice) : "-"} />
        <Stat label="등록 당시" value={stats.registered !== undefined ? formatKrw(stats.registered) : "-"} />
        <Stat label="변화" value={<ChangeText change={stats.changeFromRegistered} />} />
      </section>

      <WatchlistActions id={w.id} enabled={w.enabled} redirectOnDelete />
      <PriceChart chart={chart} now={now.getTime()} />

      {alerts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">보낸 알림</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
            {alerts.map((a) => (
              <li key={a.id ?? a.sentAt + a.alertType} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium">{ALERT_LABEL[a.alertType]}{a.isDemo && <DemoBadge className="ml-1" />}</span>
                <span className="text-xs text-muted">{a.newPrice !== undefined && `${formatKrw(a.newPrice)} · `}{timeAgo(a.sentAt, now.getTime())}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
