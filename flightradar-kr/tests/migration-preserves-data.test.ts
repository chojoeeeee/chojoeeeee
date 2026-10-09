import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const dir = path.resolve(__dirname, "../drizzle");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const apply = async (db: PGlite, f: string) => {
  for (const stmt of readFileSync(path.join(dir, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await db.exec(stmt);
};

describe("migration 0002 keeps production data", () => {
  it("existing watchlists, prices, alerts and provider calls survive and are back-filled", async () => {
    const db = new PGlite();
    for (const f of files.filter((x) => x < "0002")) await apply(db, f);

    const u = "00000000-0000-4000-8000-000000000001";
    await db.exec(`insert into users (id, email) values ('${u}', 'owner')`);
    const w = (await db.query<{ id: string }>(`insert into watchlists (user_id, origin, destination, departure_date, search_hash, registered_price, registered_is_demo, last_user_refresh_at, last_background_refresh_at)
      values ('${u}', 'ICN', 'NRT', '2026-11-12', 'h1', 199000, false, '2026-10-01T00:00:00Z', '2026-10-03T00:00:00Z') returning id`)).rows[0]!.id;
    await db.exec(`insert into price_history (watchlist_id, run_id, provider, source_type, flight_key, price, trigger_type, fetched_at) values
      ('${w}', 'r1', 'skyscanner', 'api', 'k', 199000, 'user', now()),
      ('${w}', 'r1', 'trip', 'demo', 'k', 150000, 'user', now()),
      ('${w}', 'r1', 'chulguk', 'public_web', 'd1', 139000, 'deal', now())`);
    await db.exec(`insert into alert_history (watchlist_id, alert_type, status, channel) values ('${w}', 'NEW_LOW', 'sent', 'telegram')`);
    await db.exec(`insert into provider_calls (search_hash, provider, part, trigger_type, called_at, status) values ('h1', 'skyscanner', 'flight', 'user', now(), 'ok')`);

    await apply(db, files.find((f) => f.startsWith("0002"))!);

    const wl = (await db.query<Record<string, unknown>>(`select registered_price, flexible_days, current_price, lowest_price, last_checked_at from watchlists`)).rows[0]!;
    expect(wl).toMatchObject({ registered_price: 199000, flexible_days: 0, current_price: null, lowest_price: null });
    expect(new Date(wl.last_checked_at as string).toISOString()).toBe("2026-10-03T00:00:00.000Z");
    const modes = (await db.query<{ provider: string; data_mode: string }>(`select provider, data_mode from price_history order by provider`)).rows;
    expect(modes).toEqual([
      { provider: "chulguk", data_mode: "PUBLIC_DEAL" },
      { provider: "skyscanner", data_mode: "LIVE" },
      { provider: "trip", data_mode: "DEMO" },
    ]);
    expect((await db.query<{ alert_type: string }>(`select alert_type from alert_history`)).rows).toEqual([{ alert_type: "NEW_LOWEST" }]);
    expect((await db.query<{ provider: string }>(`select provider from provider_runs`)).rows).toEqual([{ provider: "skyscanner" }]);
    await db.close();
  });
});
