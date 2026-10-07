import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { DrizzleWatchlistStore, type AnyPgDb } from "@/features/watchlist/drizzle-store";
import * as schema from "@/lib/db/schema";

/** A real (in-process) Postgres with the project's actual migration files applied. */
export async function createPgliteStore(): Promise<{ store: DrizzleWatchlistStore; close: () => Promise<void> }> {
  const client = new PGlite();
  const dir = path.resolve(__dirname, "../drizzle");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    for (const stmt of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) {
      if (stmt.trim()) await client.exec(stmt);
    }
  }
  const db = drizzle(client, { schema }) as unknown as AnyPgDb;
  return { store: new DrizzleWatchlistStore(db), close: () => client.close() };
}
