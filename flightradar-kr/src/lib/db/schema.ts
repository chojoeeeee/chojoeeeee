import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Phase 1: schema design only (not wired to a connection yet).
 * `users.id` is intended to equal Supabase `auth.users.id`.
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  telegramChatId: text("telegram_chat_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const airports = pgTable("airports", {
  code: text("code").primaryKey(), // IATA
  city: text("city").notNull(),
  cityCode: text("city_code").notNull(),
  name: text("name").notNull(),
  country: text("country").notNull(),
  utcOffsetMinutes: integer("utc_offset_minutes"),
});

export const providers = pgTable("providers", {
  name: text("name").primaryKey(),
  displayName: text("display_name").notNull(),
  kind: text("kind", { enum: ["flight", "deal"] }).notNull(),
  status: text("status", {
    enum: ["connected", "api_required", "partner_required", "unavailable", "temporary_error", "demo"],
  }).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const searches = pgTable(
  "searches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    searchHash: text("search_hash").notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departureDate: text("departure_date").notNull(),
    returnDate: text("return_date"),
    adults: integer("adults").notNull(),
    children: integer("children").default(0).notNull(),
    cabinClass: text("cabin_class").notNull(),
    directOnly: boolean("direct_only").default(false).notNull(),
    resultCount: integer("result_count").default(0).notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("searches_hash_created_idx").on(t.searchHash, t.createdAt)],
);

export const watchlists = pgTable(
  "watchlists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    departureDate: text("departure_date").notNull(),
    returnDate: text("return_date"),
    adults: integer("adults").default(1).notNull(),
    children: integer("children").default(0).notNull(),
    cabinClass: text("cabin_class").default("economy").notNull(),
    directOnly: boolean("direct_only").default(false).notNull(),
    nearbyAirports: boolean("nearby_airports").default(false).notNull(),
    targetPrice: integer("target_price"),
    alertPriceDropPercent: real("alert_price_drop_percent").default(5).notNull(),
    alertNewLow: boolean("alert_new_low").default(true).notNull(),
    notificationChannel: text("notification_channel", { enum: ["telegram"] }).default("telegram").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    /** Hash of the normalised search; watchlists with the same hash share one provider search. */
    searchHash: text("search_hash").notNull(),
    /** ±N days to compare around the chosen dates (the search's "날짜 ±3일" option). */
    flexibleDays: integer("flexible_days").default(0).notNull(),
    /** Price when the watchlist was created ("등록 당시"), and whether it was DEMO data. (DB column keeps its original name.) */
    initialPrice: integer("registered_price"),
    initialIsDemo: boolean("registered_is_demo").default(false).notNull(),
    /** Denormalised snapshot, updated on every refresh. `current_mode` says whether these two numbers are LIVE or DEMO — never mixed. */
    currentPrice: integer("current_price"),
    lowestPrice: integer("lowest_price"),
    currentMode: text("current_mode", { enum: ["LIVE", "DEMO"] }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastUserRefreshAt: timestamp("last_user_refresh_at", { withTimezone: true }),
    lastBackgroundRefreshAt: timestamp("last_background_refresh_at", { withTimezone: true }),
  },
  (t) => [index("watchlists_user_idx").on(t.userId), index("watchlists_enabled_idx").on(t.enabled), index("watchlists_search_hash_idx").on(t.searchHash)],
);

export const flightOffers = pgTable(
  "flight_offers",
  {
    id: text("id").primaryKey(),
    searchId: uuid("search_id").references(() => searches.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    flightKey: text("flight_key").notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    pricePerPerson: integer("price_per_person").notNull(),
    totalPrice: integer("total_price").notNull(),
    currency: text("currency").default("KRW").notNull(),
    bookingUrl: text("booking_url").notNull(),
    priceType: text("price_type").notNull(),
    confidence: real("confidence").default(0).notNull(),
    payload: jsonb("payload").notNull(), // full normalized FlightOffer
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("flight_offers_search_idx").on(t.searchId), index("flight_offers_key_idx").on(t.flightKey, t.provider)],
);

/** One row per (refresh run, provider, flight/deal). `source_type = 'demo'` rows are never mixed with real ones. */
export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
    /** Groups the rows written by one refresh. */
    runId: text("run_id").notNull(),
    provider: text("provider").notNull(),
    sourceType: text("source_type", { enum: ["api", "affiliate", "public_web", "demo"] }).notNull(),
    flightKey: text("flight_key").notNull(),
    /** Per-person price. */
    price: integer("price").notNull(),
    currency: text("currency").default("KRW").notNull(),
    airline: text("airline"),
    departureAt: timestamp("departure_at", { withTimezone: true }),
    returnAt: timestamp("return_at", { withTimezone: true }),
    bookingUrl: text("booking_url"),
    triggerType: text("trigger_type", { enum: ["user", "background", "deal"] }).notNull(),
    /** LIVE = real fare, DEMO = test data (never mixed with LIVE), PUBLIC_DEAL = a related deal (not a fare). */
    dataMode: text("data_mode", { enum: ["LIVE", "DEMO", "PUBLIC_DEAL"] }).default("LIVE").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("price_history_watchlist_fetched_idx").on(t.watchlistId, t.fetchedAt),
    index("price_history_watchlist_flight_provider_fetched_idx").on(t.watchlistId, t.flightKey, t.provider, t.fetchedAt),
  ],
);

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    title: text("title").notNull(),
    origin: text("origin"),
    destination: text("destination"),
    travelStartDate: text("travel_start_date"),
    travelEndDate: text("travel_end_date"),
    airline: text("airline"),
    price: integer("price").notNull(),
    currency: text("currency").default("KRW").notNull(),
    originalPrice: integer("original_price"),
    discountRate: real("discount_rate"),
    bookingUrl: text("booking_url").notNull(),
    isDemo: boolean("is_demo").default(false).notNull(),
    rawSource: text("raw_source").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("deals_published_idx").on(t.publishedAt), index("deals_destination_idx").on(t.destination)],
);

/**
 * DEPRECATED — no longer read or written. Alert de-duplication/cooldown is derived from `alert_history`.
 * The table is kept (never dropped) so existing databases lose nothing.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
    lastNotifiedPrice: integer("last_notified_price"),
    lastNotifiedIsDemo: boolean("last_notified_is_demo").default(false).notNull(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    /** True while the target was already notified and the price has not gone back above it. */
    targetActive: boolean("target_active").default(false).notNull(),
    /** { TARGET_REACHED: iso, PRICE_DROP: iso, ... } — cooldown per alert type. */
    lastByType: jsonb("last_by_type").$type<Record<string, string>>().default({}).notNull(),
    /** { [dealId]: { price, at } } — related deals already notified. */
    notifiedDeals: jsonb("notified_deals").$type<Record<string, { price: number; at: string }>>().default({}).notNull(),
  },
  (t) => [uniqueIndex("alerts_watchlist_unique").on(t.watchlistId)],
);

export const alertHistory = pgTable(
  "alert_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
    alertType: text("alert_type", { enum: ["TARGET_REACHED", "PRICE_DROP", "NEW_LOWEST", "RELATED_DEAL"] }).notNull(),
    /** For RELATED_DEAL: the deal id, so the same deal is not announced twice. */
    dedupeKey: text("dedupe_key"),
    provider: text("provider"),
    oldPrice: integer("old_price"),
    newPrice: integer("new_price"),
    isDemo: boolean("is_demo").default(false).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    status: text("status", { enum: ["sent", "dry_run", "failed"] }).notNull(),
    channel: text("channel").notNull(),
    error: text("error"),
  },
  (t) => [index("alert_history_watchlist_sent_idx").on(t.watchlistId, t.sentAt), index("alert_history_sent_idx").on(t.sentAt)],
);

export const notificationSettings = pgTable("notification_settings", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).primaryKey(),
  enabled: boolean("enabled").default(true).notNull(),
  targetAlerts: boolean("target_alerts").default(true).notNull(),
  newLowAlerts: boolean("new_low_alerts").default(true).notNull(),
  priceDropAlerts: boolean("price_drop_alerts").default(true).notNull(),
  relatedDealAlerts: boolean("related_deal_alerts").default(true).notNull(),
  cooldownHours: integer("cooldown_hours").default(6).notNull(),
  /** Absolute drop (KRW) that counts as "further drop" besides the percentage. */
  minDropAmount: integer("min_drop_amount").default(10000).notNull(),
  telegramChatId: text("telegram_chat_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One row per provider part per search / refresh. Drives minimum-interval checks
 * (reuse instead of re-calling), and the admin's search counts / last errors.
 * `network` = a real outbound request was made (false for demo / manual / skipped).
 */
export const providerRuns = pgTable(
  "provider_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    searchHash: text("search_hash").notNull(),
    /** One id per user search / refresh (a search asks six services, so six runs share it). */
    searchId: text("search_id"),
    provider: text("provider").notNull(),
    part: text("part", { enum: ["flight", "deal"] }).notNull(),
    triggerType: text("trigger_type", { enum: ["user", "background"] }).notNull(),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    resultCount: integer("result_count").default(0).notNull(),
    network: boolean("network").default(false).notNull(),
    error: text("error"),
  },
  (t) => [index("provider_runs_hash_provider_idx").on(t.searchHash, t.provider, t.part, t.calledAt), index("provider_runs_called_idx").on(t.calledAt)],
);

/** Never store API keys or personal data here. */
export const providerLogs = pgTable(
  "provider_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    resultCount: integer("result_count").notNull(),
    error: text("error"),
  },
  (t) => [index("provider_logs_provider_requested_idx").on(t.provider, t.requestedAt)],
);
