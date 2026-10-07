import { airportOffsetMinutes } from "@/config/airports";
import { epochToIso, localToEpoch } from "@/lib/time";
import type { FlightOffer, FlightSearchQuery } from "@/types/domain";
import type { FlyaiFlightResponse, FlyaiJourney, FlyaiSegment } from "./types";

/** "¥1,234.5" → 1234.5 ; anything unparseable → undefined. */
export function parseCnyPrice(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** "140分钟" / "2小时20分钟" → minutes. */
export function parseZhDuration(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const h = /(\d+)\s*小时/.exec(s);
  const m = /(\d+)\s*分/.exec(s);
  if (!h && !m) return undefined;
  return Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0);
}

function toIso(local: string | undefined, airport: string | undefined): string | undefined {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(local ?? "");
  const offset = airport ? airportOffsetMinutes(airport) : undefined;
  if (!m || offset === undefined) return undefined; // unknown time zone → refuse to guess
  return epochToIso(localToEpoch(m[1]!, m[2]!, offset), offset);
}

function journeyInfo(j: FlyaiJourney | undefined) {
  const segs: FlyaiSegment[] = j?.segments ?? [];
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (!first || !last) return undefined;
  const dep = toIso(first.depDateTime, first.depStationCode);
  const arr = toIso(last.arrDateTime, last.arrStationCode);
  const minutes = parseZhDuration(j?.totalDuration);
  if (!dep || !arr || minutes === undefined) return undefined;
  return { first, last, dep, arr, minutes, stops: segs.length - 1 };
}

/**
 * Maps FlyAI search results to FlightOffers (prices stay in CNY; the engine
 * converts with a user-supplied FX_CNY_KRW rate). A search by Chinese city name
 * returns every airport of that city, so only results for exactly the requested
 * airport pair are kept. Round trips need two journeys (outbound, inbound);
 * anything else is skipped rather than guessed.
 */
export function mapFlyaiResponse(res: FlyaiFlightResponse, query: FlightSearchQuery, fetchedAt: string): FlightOffer[] {
  const travellers = query.adults + query.children;
  const out: FlightOffer[] = [];

  (res.data?.itemList ?? []).forEach((item, i) => {
    const price = parseCnyPrice(item.adultPrice);
    const link = item.jumpUrl;
    if (price === undefined || !link || !/^https:\/\//.test(link)) return;

    const outbound = journeyInfo(item.journeys?.[0]);
    if (!outbound) return;
    if (outbound.first.depStationCode !== query.origin || outbound.last.arrStationCode !== query.destination) return;

    const inbound = query.returnDate ? journeyInfo(item.journeys?.[1]) : undefined;
    if (query.returnDate && !inbound) return;

    const stops = Math.max(outbound.stops, inbound?.stops ?? 0);
    if (query.directOnly && stops > 0) return;

    out.push({
      id: `ali-flight:${i}:${outbound.first.marketingTransportNo ?? ""}:${outbound.dep}`,
      provider: "ali-flight",
      isDemo: false,
      originAirport: query.origin,
      destinationAirport: query.destination,
      departureAt: outbound.dep,
      arrivalAt: outbound.arr,
      returnDepartureAt: inbound?.dep,
      returnArrivalAt: inbound?.arr,
      airline: outbound.first.marketingTransportName ?? "알 수 없음",
      outboundFlightNumber: outbound.first.marketingTransportNo ?? "",
      inboundFlightNumber: inbound?.first.marketingTransportNo,
      stops,
      totalDurationMinutes: outbound.minutes + (inbound?.minutes ?? 0),
      baggage: { checkedKg: null },
      cabinClass: query.cabinClass,
      currency: "CNY",
      // Fliggy quotes an adult fare; child fares are not distinguished, so totals assume the adult fare.
      pricePerPerson: price,
      totalPrice: price * travellers,
      adults: query.adults,
      children: query.children,
      seller: "Fliggy (알리바바)",
      bookingUrl: link,
      fetchedAt,
      priceType: "search",
      sourceType: "api",
      confidence: 0.3,
    });
  });
  return out;
}
