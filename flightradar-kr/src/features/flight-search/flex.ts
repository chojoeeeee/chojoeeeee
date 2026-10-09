import { addDays, daysBetween } from "@/lib/dates";
import type { FlightSearchRequest } from "@/types/domain";
import { assembleResult, type SourceResult } from "./result";

export interface ShiftedDates {
  /** −3…+3 (never 0). */
  offset: number;
  departureDate: string;
  returnDate?: string;
}

/**
 * The other date combinations to compare ("날짜 ±N일"): the trip length stays the same and the
 * whole trip slides. Combinations that start before `today` are dropped.
 */
export function shiftedDates(req: Pick<FlightSearchRequest, "departureDate" | "returnDate">, flexDays: number, today: string): ShiftedDates[] {
  const out: ShiftedDates[] = [];
  for (let d = -flexDays; d <= flexDays; d++) {
    if (d === 0) continue;
    const departureDate = addDays(req.departureDate, d);
    if (departureDate < today) continue;
    out.push({ offset: d, departureDate, returnDate: req.returnDate ? addDays(req.returnDate, d) : undefined });
  }
  return out;
}

export interface DatePrice {
  offset: number;
  departureDate: string;
  returnDate?: string;
  price?: number;
  isDemo: boolean;
}

/** Cheapest per-person price among the given flight-source results for one date combination. */
export function cheapestForDates(req: FlightSearchRequest, dates: Pick<ShiftedDates, "offset" | "departureDate" | "returnDate">, results: SourceResult[]): DatePrice {
  const shifted: FlightSearchRequest = { ...req, departureDate: dates.departureDate, returnDate: dates.returnDate };
  const best = assembleResult(shifted, results).recommendations.cheapest?.best;
  return { offset: dates.offset, departureDate: dates.departureDate, returnDate: dates.returnDate, price: best?.pricePerPerson, isDemo: best?.isDemo ?? false };
}

/** The best alternative date vs. the chosen one, if it is cheaper (same data mode only). */
export function bestSaving(chosen: { price?: number; isDemo: boolean }, others: DatePrice[]): { date: DatePrice; savingPerPerson: number } | undefined {
  if (chosen.price === undefined) return undefined;
  let best: { date: DatePrice; savingPerPerson: number } | undefined;
  for (const o of others) {
    if (o.price === undefined || o.isDemo !== chosen.isDemo) continue;
    const saving = chosen.price - o.price;
    if (saving > 0 && (!best || saving > best.savingPerPerson)) best = { date: o, savingPerPerson: saving };
  }
  return best;
}

export const tripNights = (dep: string, ret?: string) => (ret ? daysBetween(dep, ret) : 0);
