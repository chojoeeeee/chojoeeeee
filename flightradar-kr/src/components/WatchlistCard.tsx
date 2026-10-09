import Link from "next/link";
import { placeName } from "@/config/airports";
import type { StatusKey, WatchlistView } from "@/features/watchlist/view";
import { formatKrw, formatMonthDay, timeAgo } from "@/lib/format";
import { DemoBadge } from "./DemoBadge";
import { WatchlistActions } from "./WatchlistActions";

const ALERT_TEXT: Record<StatusKey, { text: string; style: string }> = {
  target_reached: { text: "🎯 목표가 도달", style: "bg-green-50 text-green-700" },
  waiting: { text: "알림 대기 중", style: "bg-brand-soft text-brand" },
  tracking: { text: "가격 추적 중", style: "bg-soft text-muted" },
  paused: { text: "알림 꺼짐", style: "bg-soft text-muted" },
  no_price: { text: "가격 확인 전", style: "bg-amber-50 text-amber-700" },
};

export function ChangeText({ change }: { change?: { amount: number; percent: number } }) {
  if (!change) return <span className="text-muted">-</span>;
  if (change.amount === 0) return <span>변동 없음</span>;
  const down = change.amount < 0;
  return (
    <span className={`font-bold ${down ? "text-green-700" : "text-red-600"}`}>
      {down ? "▼" : "▲"} {Math.abs(change.percent)}%
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-base font-bold">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

/** Server component: just the facts a traveller needs. */
export function WatchlistCard({ view, now }: { view: WatchlistView; now: number }) {
  const { watchlist: w, stats } = view;
  const cur = stats.current;
  const alert = ALERT_TEXT[view.statusKey];
  return (
    <article className="space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/watchlist/${w.id}`} className="block">
          <h2 className="text-lg font-extrabold">{placeName(w.origin)} → {placeName(w.destination)}</h2>
          <p className="text-sm text-muted">{formatMonthDay(w.departureDate)}{w.returnDate && ` ~ ${formatMonthDay(w.returnDate)}`} · 성인 {w.adults}명</p>
        </Link>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${alert.style}`}>{alert.text}</span>
      </div>

      <div>
        <p className="text-xs text-muted">현재 가격 (1인)</p>
        {cur ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-4xl font-extrabold tracking-tight">{formatKrw(cur.price)}</span>
            {cur.isDemo && <DemoBadge />}
          </p>
        ) : (
          <p className="text-sm text-muted">아직 확인된 가격이 없어요.</p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 rounded-xl bg-soft p-3">
        <Stat label="목표 가격" value={w.targetPrice !== undefined ? formatKrw(w.targetPrice) : "-"} />
        <Stat label="등록 당시" value={stats.registered !== undefined ? formatKrw(stats.registered) : "-"} />
        <Stat label="변화" value={<ChangeText change={stats.changeFromRegistered} />} />
      </div>

      <p className="text-xs text-muted">
        마지막 확인 <span suppressHydrationWarning>{timeAgo(view.lastCheckedAt, now)}</span>
        {cur?.stale && " · 오래된 가격이에요. 다시 확인해 보세요"}
      </p>

      <WatchlistActions id={w.id} enabled={w.enabled} />
    </article>
  );
}
