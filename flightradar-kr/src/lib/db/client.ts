import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

const g = globalThis as unknown as { __flightradarDb?: Db | null };

/**
 * Server-only database handle (Supabase Postgres via DATABASE_URL), or null when
 * DATABASE_URL is not set (the app then uses the in-memory store).
 * Use Supabase's *pooler* URL on serverless; `prepare: false` is required for its
 * transaction mode. The service-role / owner credentials never reach the browser.
 */
export function getDb(): Db | null {
  if (g.__flightradarDb !== undefined) return g.__flightradarDb;
  const url = env("DATABASE_URL");
  g.__flightradarDb = url ? drizzle(postgres(url, { prepare: false, max: 3 }), { schema }) : null;
  return g.__flightradarDb;
}
