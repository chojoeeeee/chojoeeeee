-- Row Level Security: deny all access through Supabase's public (anon/authenticated) API.
-- The app talks to the database only from the server over DATABASE_URL (owner role, bypasses RLS).
ALTER TABLE "airports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alert_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "flight_offers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "provider_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "searches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "watchlists" ENABLE ROW LEVEL SECURITY;
