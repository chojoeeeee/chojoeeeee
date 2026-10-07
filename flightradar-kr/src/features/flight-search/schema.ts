import { z } from "zod";
import { nearbyAirports } from "@/config/airports";
import type { FlightSearchRequest } from "@/types/domain";

const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "공항 코드는 영문 3자리입니다");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD 입니다").refine((s) => !Number.isNaN(Date.parse(s)), "존재하지 않는 날짜입니다");

export const searchParamsSchema = z
  .object({
    origin: iata,
    destination: iata,
    departureDate: date,
    returnDate: date.optional(),
    adults: z.coerce.number().int().min(1).max(9).default(1),
    children: z.coerce.number().int().min(0).max(8).default(0),
    cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
    directOnly: z.coerce.boolean().default(false),
    nearby: z.coerce.boolean().default(false),
  })
  .refine((v) => v.origin !== v.destination, { message: "출발지와 도착지가 같습니다", path: ["destination"] })
  .refine((v) => !v.returnDate || v.returnDate >= v.departureDate, { message: "귀국일은 출국일 이후여야 합니다", path: ["returnDate"] });

export type SearchParams = z.infer<typeof searchParamsSchema>;

/** Convert URL-style string params ("true"/"false") to a validated request. */
export function parseSearchParams(raw: Record<string, string | string[] | undefined>) {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) flat[k] = Array.isArray(v) ? v[0] : v;
  // z.coerce.boolean() treats "false" as true, so normalise explicitly.
  for (const k of ["directOnly", "nearby"]) {
    if (flat[k] === "false" || flat[k] === "0" || flat[k] === "") delete flat[k];
  }
  if (flat.returnDate === "") delete flat.returnDate;
  return searchParamsSchema.safeParse(flat);
}

export function toRequest(p: SearchParams): FlightSearchRequest {
  return {
    origins: p.nearby ? nearbyAirports(p.origin) : [p.origin],
    destinations: p.nearby ? nearbyAirports(p.destination) : [p.destination],
    departureDate: p.departureDate,
    returnDate: p.returnDate,
    adults: p.adults,
    children: p.children,
    cabinClass: p.cabinClass,
    directOnly: p.directOnly,
  };
}
