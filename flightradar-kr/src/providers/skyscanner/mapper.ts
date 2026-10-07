import { airportOffsetMinutes } from "@/config/airports";
import { epochToIso, localToEpoch } from "@/lib/time";
import type { FlightOffer, FlightSearchQuery } from "@/types/domain";
import type { SkyDateTime, SkyPrice, SkySearchResponse } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

function dateStr(d: SkyDateTime): string {
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}
function clock(d: SkyDateTime): string {
  return `${pad(d.hour ?? 0)}:${pad(d.minute ?? 0)}`;
}

/** Skyscanner prices are integer strings in milli-units. Returns the major unit. */
export function parsePrice(p: SkyPrice | undefined): number | undefined {
  if (!p?.amount) return undefined;
  const n = Number(p.amount);
  if (!Number.isFinite(n)) return undefined;
  switch (p.unit) {
    case "PRICE_UNIT_MILLI":
      return n / 1000;
    case "PRICE_UNIT_WHOLE":
    case undefined:
      return n;
    default:
      return undefined; // unknown unit → refuse to guess
  }
}

/**
 * Maps a Live Prices response to FlightOffers. Itineraries that cannot be
 * mapped faithfully are skipped (never filled in with made-up values).
 */
export function mapSkyscannerResponse(
  res: SkySearchResponse,
  query: FlightSearchQuery,
  fetchedAt: string,
): FlightOffer[] {
  const r = res.content?.results;
  if (!r?.itineraries || !r.legs) return [];
  const travellers = query.adults + query.children;
  const offers: FlightOffer[] = [];

  for (const [itinId, itin] of Object.entries(r.itineraries)) {
    const legs = (itin.legIds ?? []).map((id) => r.legs?.[id]);
    const [out, back] = legs;
    if (!out?.departureDateTime || !out.arrivalDateTime || out.durationInMinutes == null) continue;
    if (query.returnDate && (!back?.departureDateTime || !back.arrivalDateTime || back.durationInMinutes == null)) continue;

    const options = (itin.pricingOptions ?? [])
      .map((o) => ({ total: parsePrice(o.price), link: o.items?.[0]?.deepLink }))
      .filter((o): o is { total: number; link: string | undefined } => o.total !== undefined);
    const best = options.sort((a, b) => a.total - b.total)[0];
    if (!best?.link) continue;

    const originOffset = airportOffsetMinutes(query.origin);
    const destOffset = airportOffsetMinutes(query.destination);
    if (originOffset === undefined || destOffset === undefined) continue; // unknown time zone

    const iso = (dt: SkyDateTime, offset: number) => epochToIso(localToEpoch(dateStr(dt), clock(dt), offset), offset);

    const flightNo = (leg: typeof out) => {
      const seg = leg.segmentIds?.[0] ? r.segments?.[leg.segmentIds[0]] : undefined;
      const carrier = seg?.marketingCarrierId ? r.carriers?.[seg.marketingCarrierId] : undefined;
      return seg?.marketingFlightNumber ? `${carrier?.iataCode ?? ""}${seg.marketingFlightNumber}` : "";
    };
    const carrierName = out.marketingCarrierIds?.[0] ? r.carriers?.[out.marketingCarrierIds[0]]?.name : undefined;

    offers.push({
      id: `skyscanner:${itinId}`,
      provider: "skyscanner",
      isDemo: false,
      originAirport: query.origin,
      destinationAirport: query.destination,
      departureAt: iso(out.departureDateTime, originOffset),
      arrivalAt: iso(out.arrivalDateTime, destOffset),
      returnDepartureAt: back?.departureDateTime ? iso(back.departureDateTime, destOffset) : undefined,
      returnArrivalAt: back?.arrivalDateTime ? iso(back.arrivalDateTime, originOffset) : undefined,
      airline: carrierName ?? "알 수 없음",
      outboundFlightNumber: flightNo(out),
      inboundFlightNumber: back ? flightNo(back) || undefined : undefined,
      stops: Math.max(out.stopCount ?? 0, back?.stopCount ?? 0),
      totalDurationMinutes: out.durationInMinutes + (back?.durationInMinutes ?? 0),
      baggage: { checkedKg: null }, // not provided by this endpoint
      cabinClass: query.cabinClass,
      currency: query.currency,
      pricePerPerson: Math.round(best.total / travellers),
      totalPrice: Math.round(best.total),
      adults: query.adults,
      children: query.children,
      bookingUrl: best.link,
      fetchedAt,
      priceType: "search",
      confidence: 0.6,
    });
  }
  return offers;
}
