import { resolvePlaceLabel } from "@/config/airports";
import { addDays, daysBetween } from "@/lib/dates";
import { parseKrw } from "@/lib/parse";
import type { TravelDeal } from "@/types/domain";
import type { GodFlightRawDeal } from "./types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-11-11" | "11/11" | "11.11" | "11월 11일" → YYYY-MM-DD. Year-less dates take the next occurrence on/after yesterday. */
export function inferDate(label: string | undefined, today: string): string | undefined {
  if (!label) return undefined;
  const full = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(label);
  const md = /(\d{1,2})\s*[/.월-]\s*(\d{1,2})/.exec(label);
  const pad = (n: string) => n.padStart(2, "0");
  if (full) return `${full[1]}-${pad(full[2]!)}-${pad(full[3]!)}`;
  if (!md) return undefined;
  const month = Number(md[1]);
  const day = Number(md[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const year = Number(today.slice(0, 4));
  let candidate = `${year}-${pad(String(month))}-${pad(String(day))}`;
  if (Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))) return undefined;
  if (daysBetween(today, candidate) < -1) candidate = `${year + 1}-${pad(String(month))}-${pad(String(day))}`;
  return candidate;
}

function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
}

/** Trips on a departing-soon list are short; anything longer is treated as a misparse. */
const MAX_TRIP_DAYS = 60;

/**
 * End date of a trip that starts on `start`. A year-less end date is read in the start's year,
 * or the next year only if that makes a short trip (e.g. start 12/30, end 1/2). An end date
 * before the start that cannot be explained that way is rejected, never "fixed".
 */
export function inferEndDate(label: string | undefined, start: string): string | undefined {
  if (!label) return undefined;
  const full = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(label);
  const md = /(\d{1,2})\s*[/.월-]\s*(\d{1,2})/.exec(label);
  const pad = (n: string | number) => String(n).padStart(2, "0");
  let candidates: string[];
  if (full) candidates = [`${full[1]}-${pad(full[2]!)}-${pad(full[3]!)}`];
  else if (md) {
    const y = Number(start.slice(0, 4));
    candidates = [`${y}-${pad(md[1]!)}-${pad(md[2]!)}`, `${y + 1}-${pad(md[1]!)}-${pad(md[2]!)}`];
  } else return undefined;
  return candidates.find((c) => !Number.isNaN(Date.parse(`${c}T00:00:00Z`)) && daysBetween(start, c) >= 0 && daysBetween(start, c) <= MAX_TRIP_DAYS);
}

/** "3박4일" → { nights: 3, days: 4 } */
export function parseDuration(label: string | undefined): { nights: number; days: number } | undefined {
  const m = /(\d+)\s*박\s*(\d+)\s*일/.exec(label ?? "");
  return m ? { nights: Number(m[1]), days: Number(m[2]) } : undefined;
}

/**
 * Raw rows → TravelDeal. Rows are dropped (never repaired by guessing) when the price,
 * origin/destination or departure date is missing, when the stated weekday disagrees with
 * the date, or when the end date is before the start date. The end date comes from the
 * "도착 날짜" column; if absent, from the duration (start + days − 1).
 */
export function godflightToTravelDeals(raw: GodFlightRawDeal[], discoveredAt: string, pageUrl: string, today: string): TravelDeal[] {
  const out: TravelDeal[] = [];
  for (const r of raw) {
    const price = parseKrw(r.price);
    const start = inferDate(r.departureDate, today);
    if (price === undefined || !start || !r.origin || !r.destination) continue;
    if (r.weekday && !r.weekday.includes(weekdayOf(start))) continue; // misparsed row

    const dur = parseDuration(r.duration);
    let end = inferEndDate(r.arrivalDate, start);
    // A stated end date that is invalid (before the start) makes the row unusable; only a MISSING one falls back to the duration.
    if (r.arrivalDate && !end) continue;
    if (!end && dur) end = addDays(start, dur.days - 1);
    if (!end) continue;

    const origin = resolvePlaceLabel(r.origin) ?? r.origin;
    const destination = resolvePlaceLabel(r.destination) ?? r.destination;
    out.push({
      id: `chulguk:${origin}:${destination}:${start}:${end}:${price}`,
      provider: "chulguk",
      isDemo: false,
      title: `${r.origin} → ${r.destination} 출발 임박 특가${r.dDay ? ` (${r.dDay})` : ""}`,
      origin,
      destination,
      travelStartDate: start,
      travelEndDate: end,
      price,
      currency: "KRW",
      sourceType: "public_web",
      bookingUrl: r.sourceUrl ?? pageUrl,
      publishedAt: discoveredAt,
      expiresAt: `${start}T00:00:00+09:00`,
      rawSource: "godflight.com public list (출발 7일 이내 특가)",
    });
  }
  return out;
}
