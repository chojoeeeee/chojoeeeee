import Link from "next/link";
import { getAirport } from "@/config/airports";
import { STATUS_TEXT, type WatchlistView } from "@/features/watchlist/view";
import { formatKrw, formatMonthDay, timeAgo } from "@/lib/format";
import { DemoBadge } from "./DemoBadge";
import { WatchlistActions } from "./WatchlistActions";

const STATUS_STYLE: Record<string, string> = {
  target_reached: "bg-green-100 text-green-800",
  waiting: "bg-blue-100 text-blue-800",
  paused: "bg-slate-200 text-slate-700",
  tracking: "bg-slate-100 text-slate-700",
  no_price: "bg-amber-100 text-amber-800",
};

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export function ChangeText({ change }: { change?: { amount: number; percent: number } }) {
  if (!change) return <span className="text-muted">비교 불가</span>;
  const down = change.amount < 0;
  return (
    <span className={down ? "text-green-700" : change.amount > 0 ? "text-red-600" : ""}>
      {change.amount === 0 ? "변동 없음" : `${down ? "▼" : "▲"} ${formatKrw(Math.abs(change.amount))} (${change.percent > 0 ? "+" : ""}${change.percent}%)`}
    </span>
  );
}

/** Server component: all numbers are computed on the server from stored price history. */
export function WatchlistCard({ view, backgroundNote, demoMode, now, names }: { view: WatchlistView; backgroundNote: string; demoMode: boolean; now: number; names: Record<string, string> }) {
  const { watchlist: w, stats, score } = view;
  const cur = stats.current;
  return (
    <article className="space-y-3 rounded-2xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link href={`/watchlist/${w.id}`} className="text-lg font-bold">
            {getAirport(w.origin)?.city ?? w.origin} → {getAirport(w.destination)?.city ?? w.destination}
          </Link>
          <p className="text-xs text-muted">
            {formatMonthDay(w.departureDate)}{w.returnDate && ` ~ ${formatMonthDay(w.returnDate)}`} · 성인 {w.adults}명{w.directOnly && " · 직항만"}{w.nearbyAirports && " · 주변 공항 포함"}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[view.statusKey]}`}>{STATUS_TEXT[view.statusKey]}</span>
      </div>

      <div>
        <p className="text-[11px] text-muted">현재 확인 가격 (1인){cur?.stale && " · 24시간 이상 지난 참고 가격"}</p>
        {cur ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="whitespace-nowrap text-2xl font-bold">{formatKrw(cur.price)}</span>
            {cur.isDemo && <DemoBadge />}
          </p>
        ) : (
          <p className="text-sm text-muted">아직 확인된 가격이 없어요. &lsquo;다시 확인&rsquo;을 눌러보세요.</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="목표가" value={w.targetPrice !== undefined ? formatKrw(w.targetPrice) : "미설정"} />
        <Stat label="최근 최저가" value={stats.recentLow !== undefined ? formatKrw(stats.recentLow) : "-"} />
        <Stat label="등록 당시" value={stats.registered !== undefined ? formatKrw(stats.registered) : "-"} sub={w.registeredIsDemo ? "DEMO 기준" : undefined} />
        <Stat label="변화" value={<ChangeText change={stats.changeFromRegistered} />} />
      </div>

      {score?.score === undefined && cur && <p className="text-xs text-muted">Deal Score: 판단할 기록이 아직 부족해요.</p>}
      {score?.score !== undefined && (
        <p className="text-xs">
          Deal Score <strong>{score.score}</strong>/100 {score.emoji} {score.label}
          {score.reference && <span className="text-muted"> (기록이 적어 참고용)</span>}
        </p>
      )}

      <p className="text-xs text-muted">
        마지막 확인 <span suppressHydrationWarning>{timeAgo(view.lastCheckedAt, now)}</span>
        {cur && ` · ${names[cur.provider] ?? cur.provider}`}
      </p>
      <p className="rounded-lg bg-slate-50 p-2 text-[11px] text-muted">{backgroundNote}</p>

      <WatchlistActions id={w.id} enabled={w.enabled} demoMode={demoMode} />
    </article>
  );
}
