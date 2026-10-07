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
 * mapped faithfully (unpriced, missing legs, unknown time zone) are skipped,
 * never filled in with made-up values.
 *
 * Per itinerary the cheapest pricing option is used. Its `agentIds` give the
 * seller ("mashup" = several agents joined with " + "), and the first item's
 * deepLink is the booking URL.
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

  const iataOf = (placeId: string | undefined, fallback: string) => (placeId && r.places?.[placeId]?.iata) || fallback;

  for (const [itinId, itin] of Object.entries(r.itineraries)) {
    const [out, back] = (itin.legIds ?? []).map((id) => r.legs?.[id]);
    if (!out?.departureDateTime || !out.arrivalDateTime || out.durationInMinutes == null) continue;
    if (query.returnDate && (!back?.departureDateTime || !back.arrivalDateTime || back.durationInMinutes == null)) continue;

    const options = (itin.pricingOptions ?? [])
      .map((o) => ({ total: parsePrice(o.price), link: o.items?.[0]?.deepLink, agentIds: o.agentIds ?? (o.items?.[0]?.agentId ? [o.items[0].agentId] : []) }))
      .filter((o): o is { total: number; link: string | undefined; agentIds: string[] } => o.total !== undefined && o.total > 0);
    const best = options.sort((a, b) => a.total - b.total)[0];
    if (!best?.link) continue; // unpriced or not bookable

    const stops = Math.max(out.stopCount ?? 0, back?.stopCount ?? 0);
    if (query.directOnly && stops > 0) continue;

    const origin = iataOf(out.originPlaceId, query.origin);
    const destination = iataOf(out.destinationPlaceId, query.destination);
    const originOffset = airportOffsetMinutes(origin);
    const destOffset = airportOffsetMinutes(destination);
    if (originOffset === undefined || destOffset === undefined) continue; // unknown time zone

    const iso = (dt: SkyDateTime, offset: number) => epochToIso(localToEpoch(dateStr(dt), clock(dt), offset), offset);

    const carrierOf = (id: string | undefined) => (id ? r.carriers?.[id] : undefined);
    const flightNo = (leg: typeof out) => {
      const seg = leg.segmentIds?.[0] ? r.segments?.[leg.segmentIds[0]] : undefined;
      const carrier = carrierOf(seg?.marketingCarrierId);
      return seg?.marketingFlightNumber ? `${carrier?.iata ?? carrier?.iataCode ?? ""}${seg.marketingFlightNumber}` : "";
    };
    const carrierNames = [...new Set((out.marketingCarrierIds ?? []).map((id) => carrierOf(id)?.name).filter((n): n is string => Boolean(n)))];
    const sellers = best.agentIds.map((id) => r.agents?.[id]?.name).filter((n): n is string => Boolean(n));

    offers.push({
      id: `skyscanner:${itinId}`,
      provider: "skyscanner",
      isDemo: false,
      originAirport: origin,
      destinationAirport: destination,
      departureAt: iso(out.departureDateTime, originOffset),
      arrivalAt: iso(out.arrivalDateTime, destOffset),
      returnDepartureAt: back?.departureDateTime ? iso(back.departureDateTime, destOffset) : undefined,
      returnArrivalAt: back?.arrivalDateTime ? iso(back.arrivalDateTime, originOffset) : undefined,
      airline: carrierNames.slice(0, 2).join(" / ") || "알 수 없음",
      outboundFlightNumber: flightNo(out),
      inboundFlightNumber: back ? flightNo(back) || undefined : undefined,
      stops,
      totalDurationMinutes: out.durationInMinutes + (back?.durationInMinutes ?? 0),
      baggage: { checkedKg: null }, // not provided by this endpoint
      cabinClass: query.cabinClass,
      currency: query.currency,
      pricePerPerson: Math.round(best.total / travellers),
      totalPrice: Math.round(best.total),
      adults: query.adults,
      children: query.children,
      seller: sellers.length > 0 ? sellers.join(" + ") : undefined,
      bookingUrl: best.link,
      fetchedAt,
      priceType: "search",
      sourceType: "api",
      confidence: 0.6,
    });
  }
  return offers;
}
