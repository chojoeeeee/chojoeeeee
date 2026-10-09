import type { FlightOffer } from "@/types/domain";
import { flightKey } from "./normalize";

export interface FlightGroup {
  key: string;
  /** Cheapest offer for this physical itinerary. */
  best: FlightOffer;
  /** Same itinerary sold by each provider, cheapest first. */
  offers: FlightOffer[];
  smartScore: number;
  comfortScore: number;
}

export type SortMode = "price" | "recommended" | "departure" | "duration";

export interface Recommendations {
  cheapest?: FlightGroup;
  recommended?: FlightGroup;
  comfortable?: FlightGroup;
}

export interface ProviderPrice {
  provider: string;
  offer: FlightOffer;
  rank: number;
}

interface Weights {
  price: number;
  direct: number;
  departure: number;
  duration: number;
  baggage: number;
}

/** Smart Score weights from the spec: price 50 / direct 20 / time 10 / duration 10 / baggage 10. */
export const SMART_WEIGHTS: Weights = { price: 50, direct: 20, departure: 10, duration: 10, baggage: 10 };
/** "편한 항공편": convenience first, price matters little. */
export const COMFORT_WEIGHTS: Weights = { price: 10, direct: 35, departure: 25, duration: 20, baggage: 10 };

/** 1 at min, 0 at max. All-equal → 1. */
function invNorm(v: number, min: number, max: number): number {
  return max === min ? 1 : (max - v) / (max - min);
}

function departureComfort(iso: string): number {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return 0.5;
  const hour = Number(m[1]) + Number(m[2]) / 60;
  if (hour >= 8 && hour <= 20) return 1; // civilised hours
  if (hour >= 6 && hour < 8) return 0.6;
  if (hour > 20 && hour <= 22) return 0.6;
  return 0.2; // red-eye / very early
}

function baggageScore(o: FlightOffer): number {
  const kg = o.baggage.checkedKg;
  if (kg === null) return 0.5; // unknown ≠ none
  if (kg >= 20) return 1;
  return kg > 0 ? 0.7 : 0;
}

function score(group: FlightGroup, all: FlightGroup[], w: Weights): number {
  const prices = all.map((g) => g.best.pricePerPerson);
  const durs = all.map((g) => g.best.totalDurationMinutes);
  const o = group.best;
  const total =
    w.price * invNorm(o.pricePerPerson, Math.min(...prices), Math.max(...prices)) +
    w.direct * (o.stops === 0 ? 1 : o.stops === 1 ? 0.4 : 0) +
    w.departure * departureComfort(o.departureAt) +
    w.duration * invNorm(o.totalDurationMinutes, Math.min(...durs), Math.max(...durs)) +
    w.baggage * baggageScore(o);
  return Math.round(total);
}

export function groupOffers(offers: FlightOffer[]): FlightGroup[] {
  const map = new Map<string, FlightOffer[]>();
  for (const o of offers) {
    const k = flightKey(o);
    const list = map.get(k);
    if (list) list.push(o);
    else map.set(k, [o]);
  }
  const groups: FlightGroup[] = [...map.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.pricePerPerson - b.pricePerPerson);
    return { key, best: sorted[0]!, offers: sorted, smartScore: 0, comfortScore: 0 };
  });
  for (const g of groups) {
    g.smartScore = score(g, groups, SMART_WEIGHTS);
    g.comfortScore = score(g, groups, COMFORT_WEIGHTS);
  }
  return groups;
}

export function sortGroups(groups: FlightGroup[], mode: SortMode): FlightGroup[] {
  const by: Record<SortMode, (a: FlightGroup, b: FlightGroup) => number> = {
    price: (a, b) => a.best.pricePerPerson - b.best.pricePerPerson,
    recommended: (a, b) => b.smartScore - a.smartScore || a.best.pricePerPerson - b.best.pricePerPerson,
    departure: (a, b) => Date.parse(a.best.departureAt) - Date.parse(b.best.departureAt),
    duration: (a, b) => a.best.totalDurationMinutes - b.best.totalDurationMinutes,
  };
  return [...groups].sort(by[mode]);
}

export function recommend(groups: FlightGroup[]): Recommendations {
  if (groups.length === 0) return {};
  const pick = (cmp: (a: FlightGroup, b: FlightGroup) => number) => [...groups].sort(cmp)[0];
  return {
    cheapest: pick((a, b) => a.best.pricePerPerson - b.best.pricePerPerson),
    recommended: pick((a, b) => b.smartScore - a.smartScore || a.best.pricePerPerson - b.best.pricePerPerson),
    comfortable: pick((a, b) => b.comfortScore - a.comfortScore || a.best.pricePerPerson - b.best.pricePerPerson),
  };
}

/** Cheapest price per provider across the whole result set, ranked. */
export function providerPrices(offers: FlightOffer[]): ProviderPrice[] {
  const best = new Map<string, FlightOffer>();
  for (const o of offers) {
    const prev = best.get(o.provider);
    if (!prev || o.pricePerPerson < prev.pricePerPerson) best.set(o.provider, o);
  }
  return [...best.entries()]
    .sort((a, b) => a[1].pricePerPerson - b[1].pricePerPerson)
    .map(([provider, offer], i) => ({ provider, offer, rank: i + 1 }));
}
