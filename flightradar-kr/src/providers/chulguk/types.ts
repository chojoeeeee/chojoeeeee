/**
 * One row of godflight.com's public list of departing-soon discount flights.
 * Fields as described for the site: origin, destination, price, D-Day,
 * departure date, arrival/return date, weekday, trip duration.
 * This is a DEAL list (≤ 7 days out), not a date-searchable fare source.
 */
export interface GodFlightRawDeal {
  origin?: string; // "인천"
  destination?: string; // "도쿄"
  price?: string | number; // "149,000원"
  dDay?: string; // "D-3"
  departureDate?: string; // "11/11" | "2026-11-11" | "11.11"
  /** The "도착 날짜" column; treated as the end date of the trip (return) — see mapper. */
  arrivalDate?: string;
  weekday?: string; // "수"
  duration?: string; // "3박4일"
  sourceUrl?: string;
}
