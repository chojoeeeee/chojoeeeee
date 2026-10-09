import { airportOffsetMinutes } from "@/config/airports";
import { epochToIso, localToEpoch } from "@/lib/time";
import type { DealQuery, FlightOffer, FlightSearchQuery, TravelDeal } from "@/types/domain";
import { addDays, monthBounds } from "@/lib/dates";

/**
 * DEMO DATA ONLY.
 * Deterministic pseudo-offers used while no real API key / partner approval
 * exists. Every offer produced here carries `isDemo: true` and the UI shows
 * a "DEMO DATA" badge. These prices are NOT real market prices.
 */

interface Template {
  airline: string;
  code: string;
  outNo: number;
  inNo: number;
  outDep: string; // HH:mm local
  inDep: string;
  stops: number;
  extraMinutes: number; // added to the direct flight time when stops > 0
  checkedKg: number;
  priceMul: number;
}

const TEMPLATES: Template[] = [
  { airline: "제주항공", code: "7C", outNo: 1102, inNo: 1101, outDep: "08:20", inDep: "18:30", stops: 0, extraMinutes: 0, checkedKg: 0, priceMul: 0.8 },
  { airline: "진에어", code: "LJ", outNo: 201, inNo: 202, outDep: "09:40", inDep: "19:10", stops: 0, extraMinutes: 0, checkedKg: 15, priceMul: 0.86 },
  { airline: "대한항공", code: "KE", outNo: 703, inNo: 704, outDep: "10:30", inDep: "16:20", stops: 0, extraMinutes: 0, checkedKg: 23, priceMul: 1.18 },
  { airline: "아시아나항공", code: "OZ", outNo: 102, inNo: 101, outDep: "14:10", inDep: "17:40", stops: 0, extraMinutes: 0, checkedKg: 23, priceMul: 1.1 },
  { airline: "티웨이항공", code: "TW", outNo: 201, inNo: 202, outDep: "17:50", inDep: "12:00", stops: 0, extraMinutes: 0, checkedKg: 15, priceMul: 0.9 },
  { airline: "에어부산", code: "BX", outNo: 7413, inNo: 7414, outDep: "06:30", inDep: "09:20", stops: 1, extraMinutes: 300, checkedKg: 15, priceMul: 0.7 },
];

/** Direct flight time in minutes for known routes (symmetrical). */
const ROUTE_MINUTES: Record<string, number> = {
  "ICN-NRT": 145,
  "ICN-HND": 150,
  "GMP-HND": 140,
  "ICN-KIX": 115,
  "ICN-FUK": 100,
  "PUS-FUK": 65,
  "ICN-UKB": 120,
};

function routeMinutes(a: string, b: string): number {
  return ROUTE_MINUTES[`${a}-${b}`] ?? ROUTE_MINUTES[`${b}-${a}`] ?? 130;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pseudo-random in [0,1). */
function unit(seed: string): number {
  return (hash(seed) % 10000) / 10000;
}

export interface MockOptions {
  provider: string;
  /** Multiplier on top of the route base price (provider spread). */
  bias: number;
  /** Subset of carrier codes this mock "sells"; omit for all. */
  carriers?: string[];
  now?: () => Date;
}

/**
 * DEMO_PRICE_OFFSET (KRW, may be negative): shifts every DEMO fare so a price move can be rehearsed
 * deterministically (lower it, then press 다시 확인). DEMO data only — never touches real fares.
 */
function demoPriceOffset(): number {
  const n = Number(process.env.DEMO_PRICE_OFFSET);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function generateDemoOffers(query: FlightSearchQuery, opts: MockOptions): FlightOffer[] {
  const outOffset = airportOffsetMinutes(query.origin);
  const destOffset = airportOffsetMinutes(query.destination);
  if (outOffset === undefined || destOffset === undefined) return [];

  const fetchedAt = (opts.now?.() ?? new Date()).toISOString();
  const base = 150_000 + Math.round(unit(`${query.origin}-${query.destination}-${query.departureDate}`) * 110_000);
  const flightMinutes = routeMinutes(query.origin, query.destination);
  const travellers = query.adults + query.children;

  return TEMPLATES.filter((t) => !opts.carriers || opts.carriers.includes(t.code))
    .filter((t) => !query.directOnly || t.stops === 0)
    .map((t) => {
      const noise = 0.97 + unit(`${opts.provider}-${t.code}-${query.departureDate}`) * 0.08;
      const perPerson = Math.max(10_000, Math.round((base * t.priceMul * opts.bias * noise) / 100) * 100 + demoPriceOffset());
      const legMinutes = flightMinutes + t.extraMinutes;

      const outDepMs = localToEpoch(query.departureDate, t.outDep, outOffset);
      const outArrMs = outDepMs + legMinutes * 60000;

      let returnDepartureAt: string | undefined;
      let returnArrivalAt: string | undefined;
      let totalLegs = legMinutes;
      const isRoundTrip = Boolean(query.returnDate);
      if (query.returnDate) {
        const inDepMs = localToEpoch(query.returnDate, t.inDep, destOffset);
        returnDepartureAt = epochToIso(inDepMs, destOffset);
        returnArrivalAt = epochToIso(inDepMs + legMinutes * 60000, outOffset);
        totalLegs += legMinutes;
      }

      return {
        id: `${opts.provider}:${query.origin}${query.destination}:${t.code}${t.outNo}:${query.departureDate}`,
        provider: opts.provider,
        isDemo: true,
        originAirport: query.origin,
        destinationAirport: query.destination,
        departureAt: epochToIso(outDepMs, outOffset),
        arrivalAt: epochToIso(outArrMs, destOffset),
        returnDepartureAt,
        returnArrivalAt,
        airline: t.airline,
        outboundFlightNumber: `${t.code}${t.outNo}`,
        inboundFlightNumber: isRoundTrip ? `${t.code}${t.inNo}` : undefined,
        stops: t.stops,
        totalDurationMinutes: totalLegs,
        baggage: { checkedKg: t.checkedKg },
        cabinClass: query.cabinClass,
        currency: "KRW",
        pricePerPerson: perPerson,
        totalPrice: perPerson * travellers,
        adults: query.adults,
        children: query.children,
        bookingUrl: `https://example.com/demo/${opts.provider}`,
        fetchedAt,
        priceType: "search" as const,
        sourceType: "demo" as const,
        confidence: 0,
      } satisfies FlightOffer;
    });
}

export type DemoDealStyle = "window+exact" | "catchfrog" | "godflight";

/**
 * DEMO DATA ONLY.
 *  - "catchfrog": route + price + discount vs. average, no dates (like the public list).
 *  - "godflight": one exact-date deal a day earlier (departing-soon list).
 *  - "window+exact": a month-wide window deal plus an exact deal a day earlier.
 */
export function generateDemoDeals(q: DealQuery, provider: string, style: DemoDealStyle = "window+exact", now: Date = new Date()): TravelDeal[] {
  const origin = q.origins[0];
  const destination = q.destinations[0];
  if (!origin || !destination) return [];
  const base = 150_000 + Math.round(unit(`${origin}-${destination}-${q.departureDate}`) * 110_000);
  const round1000 = (n: number) => Math.round(n / 1000) * 1000;
  const month = monthBounds(q.departureDate);
  const publishedAt = now.toISOString();
  const mk = (suffix: string, title: string, price: number, start?: string, end?: string, extra: Partial<TravelDeal> = {}): TravelDeal => ({
    id: `${provider}:deal:${destination}:${suffix}:${q.departureDate}`,
    provider,
    isDemo: true,
    title,
    origin,
    destination,
    travelStartDate: start,
    travelEndDate: end,
    price,
    currency: "KRW",
    sourceType: "demo",
    bookingUrl: `https://example.com/demo/${provider}`,
    publishedAt,
    rawSource: "demo",
    ...extra,
  });
  if (style === "catchfrog") {
    const price = round1000(base * 0.85);
    return [mk("avg", `${destination} 특가 항공권`, price, undefined, undefined, { originalPrice: round1000(price / 0.68), discountRate: 0.32 })];
  }
  const exact = q.returnDate ? mk("exact", `${destination} 출발 임박 특가`, round1000(base * 0.6), addDays(q.departureDate, -1), addDays(q.returnDate, -1)) : undefined;
  if (style === "godflight") return exact ? [exact] : [];
  const deals = [mk("window", `${destination} 왕복 특가`, round1000(base * 0.7), month.start, month.end)];
  if (exact) deals.push(exact);
  return deals;
}
