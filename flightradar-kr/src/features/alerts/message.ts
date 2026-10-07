import { getAirport } from "@/config/airports";
import { describeShift } from "@/features/deal-engine/related";
import type { DealScore, CurrentPrice } from "@/features/price-history/stats";
import type { Watchlist } from "@/features/watchlist/types";
import type { NotificationMessage } from "@/lib/notifications/types";
import type { AlertDecision } from "./evaluate";

const krw = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function formatKst(iso: string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
  return parts; // "2026-10-07 18:32"
}

const city = (code: string) => getAirport(code)?.city ?? code;

export interface BuiltMessage {
  message: NotificationMessage;
  decisions: AlertDecision[];
}

export interface MessageContext {
  watchlist: Pick<Watchlist, "origin" | "destination" | "departureDate" | "returnDate" | "targetPrice">;
  current?: CurrentPrice;
  score?: DealScore;
  names: Record<string, string>;
  /** Link to open (the offer's booking URL or the app's watchlist page). */
  fallbackUrl?: string;
}

const PRIORITY: Record<string, number> = { TARGET_REACHED: 0, NEW_LOW: 1, PRICE_DROP: 2 };

/**
 * ONE message per evaluation for the fare conditions (target / drop / new low), however many were
 * met, plus one message per related deal. Only decisions with shouldNotify are used.
 */
export function buildAlertMessages(decisions: AlertDecision[], ctx: MessageContext): BuiltMessage[] {
  const out: BuiltMessage[] = [];
  const fare = decisions.filter((d) => d.shouldNotify && d.type !== "RELATED_DEAL").sort((a, b) => PRIORITY[a.type]! - PRIORITY[b.type]!);
  const w = ctx.watchlist;
  const route = `${city(w.origin)}(${w.origin}) → ${city(w.destination)}(${w.destination})`;
  const dates = `${md(w.departureDate)}${w.returnDate ? ` ~ ${md(w.returnDate)}` : ""}`;

  if (fare.length > 0 && ctx.current) {
    const top = fare[0]!;
    const cur = ctx.current;
    const drop = fare.find((d) => d.oldPrice !== undefined && d.oldPrice > cur.price);
    const title =
      top.type === "TARGET_REACHED" ? `🎯 ${city(w.destination)} 항공권 목표가 도달` : top.type === "NEW_LOW" ? `📉 ${city(w.destination)} 항공권 새로운 최저가` : `🔥 ${city(w.destination)} 항공권 가격 하락`;
    const lines = [title, route, dates, "", "현재 최저가", krw(cur.price)];
    if (drop?.oldPrice !== undefined) lines.push("이전", krw(drop.oldPrice), `${krw(drop.oldPrice - cur.price)} 하락 ↓`);
    if (w.targetPrice !== undefined) {
      lines.push("", "목표 가격", krw(w.targetPrice));
      if (fare.some((d) => d.type === "TARGET_REACHED")) lines.push("✅ 목표가 도달");
    }
    if (ctx.score?.score !== undefined) lines.push("", "Deal Score", `${ctx.score.score}/100 ${ctx.score.emoji}${ctx.score.label}${ctx.score.reference ? " (참고용)" : ""}`.trim());
    lines.push("", "확인 서비스", ctx.names[cur.provider] ?? cur.provider, "마지막 확인", formatKst(cur.at));
    if (cur.stale) lines.push("(24시간 이상 지난 참고 가격입니다)");
    out.push({
      message: { title, text: lines.join("\n"), url: cur.bookingUrl ?? ctx.fallbackUrl, urlLabel: "항공권 확인하기", isDemo: cur.isDemo },
      decisions: fare,
    });
  }

  for (const d of decisions.filter((x) => x.shouldNotify && x.type === "RELATED_DEAL" && x.deal)) {
    const { deal, shiftDays } = d.deal!;
    const title = "🔥 비슷한 일정의 특가 발견";
    const lines = [title, route, "", "현재 선택 일정", dates, "특가 일정", deal.travelStartDate && deal.travelEndDate ? `${md(deal.travelStartDate)} ~ ${md(deal.travelEndDate)}` : "날짜 정보 없음 (같은 노선)", "", "가격", `${krw(deal.price)}~`];
    if (deal.discountRate !== undefined) lines.push(`평균 대비 -${Math.round(deal.discountRate * 100)}%`);
    if (d.oldPrice !== undefined && d.oldPrice > deal.price && shiftDays !== undefined && shiftDays !== 0) {
      lines.push("", `일정을 ${describeShift(shiftDays)}`, `약 ${krw(d.oldPrice - deal.price)} 절약할 수 있습니다.`);
    }
    lines.push("", "출처", ctx.names[deal.provider] ?? deal.provider);
    out.push({ message: { title, text: lines.join("\n"), url: deal.bookingUrl, urlLabel: "특가 확인하기", isDemo: deal.isDemo }, decisions: [d] });
  }
  return out;
}
