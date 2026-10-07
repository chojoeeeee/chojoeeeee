import type { FlightOffer } from "@/types/domain";

/** KRW per 1 unit of foreign currency. Must be supplied by the caller — never hardcoded. */
export type FxRates = Record<string, number>;

export function toKrw(amount: number, currency: string, rates: FxRates): number | undefined {
  if (currency === "KRW") return amount;
  const rate = rates[currency];
  if (!rate || !(rate > 0)) return undefined;
  return Math.round(amount * rate);
}

/** Identity of the physical itinerary, independent of who sells it. */
export function flightKey(o: FlightOffer): string {
  const dep = Math.floor(Date.parse(o.departureAt) / 60000);
  const ret = o.returnDepartureAt ? Math.floor(Date.parse(o.returnDepartureAt) / 60000) : "ow";
  return [o.originAirport, o.destinationAirport, o.outboundFlightNumber || o.airline, o.inboundFlightNumber ?? "-", dep, ret].join("|");
}

function isSane(o: FlightOffer): boolean {
  const dep = Date.parse(o.departureAt);
  const arr = Date.parse(o.arrivalAt);
  if (!Number.isFinite(dep) || !Number.isFinite(arr) || arr <= dep) return false;
  if (o.returnDepartureAt) {
    const rd = Date.parse(o.returnDepartureAt);
    const ra = Date.parse(o.returnArrivalAt ?? "");
    if (!Number.isFinite(rd) || !Number.isFinite(ra) || ra <= rd || rd <= arr) return false;
  }
  return Number.isFinite(o.pricePerPerson) && o.pricePerPerson > 0 && o.totalPrice > 0;
}

/**
 * Brings every offer to KRW, drops malformed / unconvertible offers and
 * duplicates (same provider + same flight → keep the cheapest).
 */
export function normalizeOffers(offers: FlightOffer[], rates: FxRates = {}): { offers: FlightOffer[]; dropped: number } {
  const best = new Map<string, FlightOffer>();
  let dropped = 0;

  for (const raw of offers) {
    const per = toKrw(raw.pricePerPerson, raw.currency, rates);
    const total = toKrw(raw.totalPrice, raw.currency, rates);
    if (per === undefined || total === undefined) {
      dropped++;
      continue;
    }
    const o: FlightOffer = { ...raw, currency: "KRW", pricePerPerson: per, totalPrice: total, confidence: raw.isDemo ? 0 : raw.confidence };
    if (!isSane(o)) {
      dropped++;
      continue;
    }
    const key = `${o.provider}|${flightKey(o)}`;
    const prev = best.get(key);
    if (prev) dropped++; // one of the two duplicates is discarded either way
    if (!prev || o.pricePerPerson < prev.pricePerPerson) best.set(key, o);
  }
  return { offers: [...best.values()], dropped };
}
