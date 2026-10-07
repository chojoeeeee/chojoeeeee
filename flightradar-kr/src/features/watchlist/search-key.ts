import { createHash } from "node:crypto";
import { nearbyAirports } from "@/config/airports";
import type { FlightSearchRequest } from "@/types/domain";
import type { Watchlist } from "./types";

type SearchFields = Pick<Watchlist, "origin" | "destination" | "departureDate" | "returnDate" | "cabinClass" | "adults" | "children" | "directOnly" | "nearbyAirports">;

/** Normalised search identity. Watchlists with the same hash share ONE provider search. */
export function watchlistSearchHash(w: SearchFields): string {
  const canonical = JSON.stringify([w.origin.toUpperCase(), w.destination.toUpperCase(), w.departureDate, w.returnDate ?? null, w.cabinClass, w.adults, w.children, w.directOnly, w.nearbyAirports]);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

export function toSearchRequest(w: SearchFields): FlightSearchRequest {
  return {
    origins: w.nearbyAirports ? nearbyAirports(w.origin) : [w.origin],
    destinations: w.nearbyAirports ? nearbyAirports(w.destination) : [w.destination],
    departureDate: w.departureDate,
    returnDate: w.returnDate,
    adults: w.adults,
    children: w.children,
    cabinClass: w.cabinClass,
    directOnly: w.directOnly,
  };
}
