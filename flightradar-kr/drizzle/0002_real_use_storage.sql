ALTER TABLE "provider_calls" RENAME TO "provider_runs";--> statement-breakpoint
DROP INDEX "provider_calls_hash_provider_idx";--> statement-breakpoint
DROP INDEX "provider_calls_called_idx";--> statement-breakpoint
ALTER TABLE "alert_history" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "price_history" ADD COLUMN "data_mode" text DEFAULT 'LIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_runs" ADD COLUMN "search_id" text;--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "flexible_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "current_price" integer;--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "lowest_price" integer;--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "current_mode" text;--> statement-breakpoint
ALTER TABLE "watchlists" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "provider_runs_hash_provider_idx" ON "provider_runs" USING btree ("search_hash","provider","part","called_at");--> statement-breakpoint
CREATE INDEX "provider_runs_called_idx" ON "provider_runs" USING btree ("called_at");--> statement-breakpoint
-- Back-fill for rows written before this migration (data is only updated, never deleted).
UPDATE "price_history" SET "data_mode" = CASE WHEN "source_type" = 'demo' THEN 'DEMO' WHEN "trigger_type" = 'deal' THEN 'PUBLIC_DEAL' ELSE 'LIVE' END;--> statement-breakpoint
UPDATE "watchlists" SET "last_checked_at" = GREATEST("last_user_refresh_at", "last_background_refresh_at") WHERE "last_user_refresh_at" IS NOT NULL OR "last_background_refresh_at" IS NOT NULL;--> statement-breakpoint
UPDATE "alert_history" SET "alert_type" = 'NEW_LOWEST' WHERE "alert_type" = 'NEW_LOW';
