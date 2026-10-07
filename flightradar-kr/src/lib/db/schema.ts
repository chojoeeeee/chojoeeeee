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
    flexibleDays: integer("flexible_days").default(0).notNull(),
    adults: integer("adults").default(1).notNull(),
    children: integer("children").default(0).notNull(),
    cabinClass: text("cabin_class").default("economy").notNull(),
    directOnly: boolean("direct_only").default(false).notNull(),
    nearbyAirports: boolean("nearby_airports").default(false).notNull(),
    targetPrice: integer("target_price"),
    alertOnPriceDrop: boolean("alert_on_price_drop").default(true).notNull(),
    alertDropPercent: real("alert_drop_percent").default(5).notNull(),
    alertNewLow: boolean("alert_new_low").default(true).notNull(),
    notificationChannel: text("notification_channel", { enum: ["telegram", "email", "web_push"] }).default("telegram").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (t) => [index("watchlists_user_idx").on(t.userId), index("watchlists_enabled_checked_idx").on(t.enabled, t.lastCheckedAt)],
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

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
    provider: text("provider").notNull(),
    price: integer("price").notNull(),
    currency: text("currency").default("KRW").notNull(),
    airline: text("airline"),
    flightKey: text("flight_key").notNull(),
    departureAt: timestamp("departure_at", { withTimezone: true }),
    returnAt: timestamp("return_at", { withTimezone: true }),
    isDemo: boolean("is_demo").default(false).notNull(),
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

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "cascade" }).notNull(),
    lastNotifiedPrice: integer("last_notified_price"),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    minDropPercent: real("min_drop_percent").default(5).notNull(),
    minDropAmount: integer("min_drop_amount").default(10000).notNull(),
  },
  (t) => [uniqueIndex("alerts_watchlist_unique").on(t.watchlistId)],
);

export const alertHistory = pgTable(
  "alert_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id").references(() => alerts.id, { onDelete: "cascade" }).notNull(),
    channel: text("channel").notNull(),
    price: integer("price").notNull(),
    reason: text("reason").notNull(), // target_reached | price_drop | new_low
    delivered: boolean("delivered").default(false).notNull(),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("alert_history_alert_sent_idx").on(t.alertId, t.sentAt)],
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
