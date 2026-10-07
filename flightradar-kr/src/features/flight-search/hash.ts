import { createHash } from "node:crypto";
import type { FlightSearchQuery } from "@/types/domain";

/** Stable hash of everything that affects a provider's answer. */
export function searchHash(query: FlightSearchQuery, provider?: string): string {
  const canonical = JSON.stringify([
    provider ?? "*",
    query.origin,
    query.destination,
    query.departureDate,
    query.returnDate ?? null,
    query.adults,
    query.children,
    query.cabinClass,
    query.directOnly,
    query.currency,
  ]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
