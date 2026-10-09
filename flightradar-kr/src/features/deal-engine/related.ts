import { getAirport } from "@/config/airports";
import { daysBetween } from "@/lib/dates";
import type { FlightSearchRequest, TravelDeal } from "@/types/domain";

/** ± days within which an exact-date deal counts as "similar dates". */
export const NEAR_DATE_DAYS = 3;
/** A deal's trip length may differ from the searched one by at most this many days. */
export const TRIP_LENGTH_TOLERANCE_DAYS = 1;

export type DealMatch = "window" | "same_dates" | "near_dates" | "destination_only";

export interface RelatedDeal {
  deal: TravelDeal;
  match: DealMatch;
  /** For near_dates: deal start − requested departure, in days (negative = earlier). */
  shiftDays?: number;
}

export interface SavingsTip {
  shiftDays: number;
  savingPerPerson: number;
  deal: TravelDeal;
}

const cityOf = (code: string) => getAirport(code)?.cityCode ?? code.toUpperCase();

export function relatedDeals(deals: TravelDeal[], req: FlightSearchRequest): RelatedDeal[] {
  const wantedCities = new Set(req.destinations.map(cityOf));
  const wantedOrigins = new Set(req.origins.map(cityOf));
  const tripLen = req.returnDate ? daysBetween(req.departureDate, req.returnDate) : 0;
  const out: RelatedDeal[] = [];

  for (const deal of deals) {
    // Route must match: origin (when the deal states one) and destination.
    if (deal.origin && !wantedOrigins.has(cityOf(deal.origin))) continue;
    if (deal.destination && !wantedCities.has(cityOf(deal.destination))) continue;

    const { travelStartDate: start, travelEndDate: end } = deal;
    if (!start || !end) {
      out.push({ deal, match: "destination_only" });
      continue;
    }
    const span = daysBetween(start, end);
    const containsRequest = start <= req.departureDate && (req.returnDate ?? req.departureDate) <= end;

    if (containsRequest && span > tripLen + NEAR_DATE_DAYS) {
      out.push({ deal, match: "window" });
      continue;
    }
    // Similar trip length is required (only checkable for round-trip searches).
    if (req.returnDate && Math.abs(span - tripLen) > TRIP_LENGTH_TOLERANCE_DAYS) continue;
    const shift = daysBetween(req.departureDate, start);
    if (shift === 0) out.push({ deal, match: "same_dates", shiftDays: 0 });
    else if (Math.abs(shift) <= NEAR_DATE_DAYS) out.push({ deal, match: "near_dates", shiftDays: shift });
    // anything else is for different dates → not related
  }
  return out.sort((a, b) => a.deal.price - b.deal.price);
}

/**
 * "Shift your trip by N days and save up to X per person" — only for exact-date
 * deals within ±3 days that are cheaper than the current cheapest flight.
 */
export function savingsTip(related: RelatedDeal[], cheapestPerPerson: number | undefined): SavingsTip | undefined {
  if (cheapestPerPerson === undefined) return undefined;
  let best: SavingsTip | undefined;
  for (const r of related) {
    if (r.match !== "near_dates" || r.shiftDays === undefined || r.deal.currency !== "KRW") continue;
    const saving = cheapestPerPerson - r.deal.price;
    if (saving > 0 && (!best || saving > best.savingPerPerson)) best = { shiftDays: r.shiftDays, savingPerPerson: saving, deal: r.deal };
  }
  return best;
}

export function describeShift(shiftDays: number): string {
  const n = Math.abs(shiftDays);
  return shiftDays < 0 ? `${n === 1 ? "하루" : `${n}일`} 앞당기면` : `${n === 1 ? "하루" : `${n}일`} 미루면`;
}

/** Keywords sent to deal providers that search by text. */
export function dealKeywords(req: FlightSearchRequest): string[] {
  const kw = new Set<string>();
  for (const code of req.destinations) {
    kw.add(code);
    const a = getAirport(code);
    if (a) {
      kw.add(a.city);
      kw.add(a.cityCode);
      kw.add(a.country === "JP" ? "일본" : a.country);
    }
  }
  const month = Number(req.departureDate.slice(5, 7));
  kw.add(`${month}월`);
  return [...kw];
}
