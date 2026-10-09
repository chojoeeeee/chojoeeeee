import { resolvePlaceLabel } from "@/config/airports";
import { parseDiscountFraction, parseKrw } from "@/lib/parse";
import type { TravelDeal } from "@/types/domain";
import type { CatchfrogDeal, CatchfrogRawDeal } from "./types";

/**
 * Raw page records → CatchfrogDeal. Records without a destination or a parseable
 * price are dropped. When the page gives a price and a discount but no average,
 * the average is derived (price / (1 − discount)); when it gives both, the page's
 * own numbers are kept.
 */
export function parseCatchfrogRaw(raw: CatchfrogRawDeal[], discoveredAt: string, pageUrl: string): CatchfrogDeal[] {
  const out: CatchfrogDeal[] = [];
  for (const r of raw) {
    const price = parseKrw(r.price);
    const destination = r.destination?.trim();
    if (price === undefined || !destination) continue;
    const discount = parseDiscountFraction(r.discountPercent);
    const averagePrice = parseKrw(r.averagePrice) ?? (discount !== undefined ? Math.round(price / (1 - discount)) : undefined);
    out.push({ destination, price, averagePrice, discountPercent: discount, departureOrigin: r.origin?.trim() || undefined, discoveredAt, sourceUrl: r.sourceUrl ?? pageUrl });
  }
  return out;
}

export function catchfrogToTravelDeal(d: CatchfrogDeal): TravelDeal {
  return {
    id: `catchfrog:${d.departureOrigin ?? "-"}:${d.destination}:${d.price}`,
    provider: "catchfrog",
    isDemo: false,
    title: `${d.destination} 특가 항공권`,
    origin: resolvePlaceLabel(d.departureOrigin),
    destination: resolvePlaceLabel(d.destination) ?? d.destination,
    // The public list shows route + price + discount, no travel dates.
    price: d.price,
    currency: "KRW",
    originalPrice: d.averagePrice,
    discountRate: d.discountPercent,
    sourceType: "public_web",
    bookingUrl: d.sourceUrl,
    publishedAt: d.discoveredAt,
    rawSource: "catchfrog.ai public list (뚝 떨어진 항공권)",
  };
}
