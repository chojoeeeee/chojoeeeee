CREATE TABLE "airports" (
	"code" text PRIMARY KEY NOT NULL,
	"city" text NOT NULL,
	"city_code" text NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"utc_offset_minutes" integer
);
--> statement-breakpoint
CREATE TABLE "alert_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"provider" text,
	"old_price" integer,
	"new_price" integer,
	"is_demo" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"channel" text NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"last_notified_price" integer,
	"last_notified_is_demo" boolean DEFAULT false NOT NULL,
	"last_notified_at" timestamp with time zone,
	"target_active" boolean DEFAULT false NOT NULL,
	"last_by_type" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notified_deals" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"title" text NOT NULL,
	"origin" text,
	"destination" text,
	"travel_start_date" text,
	"travel_end_date" text,
	"airline" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"original_price" integer,
	"discount_rate" real,
	"booking_url" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"raw_source" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "flight_offers" (
	"id" text PRIMARY KEY NOT NULL,
	"search_id" uuid,
	"provider" text NOT NULL,
	"flight_key" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"price_per_person" integer NOT NULL,
	"total_price" integer NOT NULL,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"booking_url" text NOT NULL,
	"price_type" text NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"target_alerts" boolean DEFAULT true NOT NULL,
	"new_low_alerts" boolean DEFAULT true NOT NULL,
	"price_drop_alerts" boolean DEFAULT true NOT NULL,
	"related_deal_alerts" boolean DEFAULT true NOT NULL,
	"cooldown_hours" integer DEFAULT 6 NOT NULL,
	"min_drop_amount" integer DEFAULT 10000 NOT NULL,
	"telegram_chat_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlist_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"provider" text NOT NULL,
	"source_type" text NOT NULL,
	"flight_key" text NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'KRW' NOT NULL,
	"airline" text,
	"departure_at" timestamp with time zone,
	"return_at" timestamp with time zone,
	"booking_url" text,
	"trigger_type" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_hash" text NOT NULL,
	"provider" text NOT NULL,
	"part" text NOT NULL,
	"trigger_type" text NOT NULL,
	"called_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"network" boolean DEFAULT false NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "provider_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"result_count" integer NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"name" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_success_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_hash" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"departure_date" text NOT NULL,
	"return_date" text,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"cabin_class" text NOT NULL,
	"direct_only" boolean DEFAULT false NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"telegram_chat_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"departure_date" text NOT NULL,
	"return_date" text,
	"adults" integer DEFAULT 1 NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"cabin_class" text DEFAULT 'economy' NOT NULL,
	"direct_only" boolean DEFAULT false NOT NULL,
	"nearby_airports" boolean DEFAULT false NOT NULL,
	"target_price" integer,
	"alert_price_drop_percent" real DEFAULT 5 NOT NULL,
	"alert_new_low" boolean DEFAULT true NOT NULL,
	"notification_channel" text DEFAULT 'telegram' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"search_hash" text NOT NULL,
	"registered_price" integer,
	"registered_is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_user_refresh_at" timestamp with time zone,
	"last_background_refresh_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_offers" ADD CONSTRAINT "flight_offers_search_id_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_watchlist_id_watchlists_id_fk" FOREIGN KEY ("watchlist_id") REFERENCES "public"."watchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_history_watchlist_sent_idx" ON "alert_history" USING btree ("watchlist_id","sent_at");--> statement-breakpoint
CREATE INDEX "alert_history_sent_idx" ON "alert_history" USING btree ("sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_watchlist_unique" ON "alerts" USING btree ("watchlist_id");--> statement-breakpoint
CREATE INDEX "deals_published_idx" ON "deals" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "deals_destination_idx" ON "deals" USING btree ("destination");--> statement-breakpoint
CREATE INDEX "flight_offers_search_idx" ON "flight_offers" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "flight_offers_key_idx" ON "flight_offers" USING btree ("flight_key","provider");--> statement-breakpoint
CREATE INDEX "price_history_watchlist_fetched_idx" ON "price_history" USING btree ("watchlist_id","fetched_at");--> statement-breakpoint
CREATE INDEX "price_history_watchlist_flight_provider_fetched_idx" ON "price_history" USING btree ("watchlist_id","flight_key","provider","fetched_at");--> statement-breakpoint
CREATE INDEX "provider_calls_hash_provider_idx" ON "provider_calls" USING btree ("search_hash","provider","part","called_at");--> statement-breakpoint
CREATE INDEX "provider_calls_called_idx" ON "provider_calls" USING btree ("called_at");--> statement-breakpoint
CREATE INDEX "provider_logs_provider_requested_idx" ON "provider_logs" USING btree ("provider","requested_at");--> statement-breakpoint
CREATE INDEX "searches_hash_created_idx" ON "searches" USING btree ("search_hash","created_at");--> statement-breakpoint
CREATE INDEX "watchlists_user_idx" ON "watchlists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "watchlists_enabled_idx" ON "watchlists" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "watchlists_search_hash_idx" ON "watchlists" USING btree ("search_hash");