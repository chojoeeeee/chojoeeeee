import { z } from "zod";

const iata = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "공항 코드는 영문 3자리입니다");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD 입니다").refine((s) => !Number.isNaN(Date.parse(s)), "존재하지 않는 날짜입니다");

export const createWatchlistSchema = z
  .object({
    origin: iata,
    destination: iata,
    departureDate: date,
    returnDate: date.optional(),
    adults: z.number().int().min(1).max(9).default(1),
    children: z.number().int().min(0).max(8).default(0),
    cabinClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
    directOnly: z.boolean().default(false),
    nearbyAirports: z.boolean().default(false),
    /** Per-person target price in KRW. */
    targetPrice: z.number().int().min(1000).max(50_000_000).optional(),
    alertPriceDropPercent: z.number().min(1).max(90).default(5),
    alertNewLowest: z.boolean().default(true),
    notificationChannel: z.enum(["telegram"]).default("telegram"),
    enabled: z.boolean().default(true),
  })
  .refine((v) => v.origin !== v.destination, { message: "출발지와 도착지가 같습니다", path: ["destination"] })
  .refine((v) => !v.returnDate || v.returnDate >= v.departureDate, { message: "귀국일은 출국일 이후여야 합니다", path: ["returnDate"] });

export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

export const patchWatchlistSchema = z
  .object({
    enabled: z.boolean(),
    targetPrice: z.number().int().min(1000).max(50_000_000).nullable(),
    alertPriceDropPercent: z.number().min(1).max(90),
    alertNewLow: z.boolean(),
  })
  .partial()
  .strict();

export const notificationSettingsSchema = z
  .object({
    enabled: z.boolean(),
    targetAlerts: z.boolean(),
    newLowAlerts: z.boolean(),
    priceDropAlerts: z.boolean(),
    relatedDealAlerts: z.boolean(),
    cooldownHours: z.number().min(0).max(168),
    minDropAmount: z.number().int().min(0).max(10_000_000),
  })
  .partial()
  .strict();
