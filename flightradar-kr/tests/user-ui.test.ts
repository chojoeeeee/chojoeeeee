import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { placeName } from "@/config/airports";
import { bestSaving, cheapestForDates, shiftedDates } from "@/features/flight-search/flex";
import type { SourceResult, SourceStatus } from "@/features/flight-search/result";
import { parseSearchParams } from "@/features/flight-search/schema";
import { proxy } from "@/proxy";
import { adminAccess } from "@/lib/admin-auth";
import { adminBadge, userStatus } from "@/lib/status-labels";
import { demoOffers, request } from "./helpers";

afterEach(() => vi.unstubAllEnvs());

const ALL: SourceStatus[] = ["ok", "deals_only", "no_results", "manual_check", "api_required", "partner_required", "unavailable", "timeout", "error", "policy_skipped"];

describe("user-facing status wording", () => {
  const row = (status: SourceStatus, isDemo = false, role: "flight" | "deal" = "flight") => ({ status, isDemo, role });

  it("maps developer states to the plain expressions the product uses", () => {
    expect(userStatus(row("api_required"))?.text).toBe("현재 자동 조회 준비 중");
    expect(userStatus(row("partner_required"))?.text).toBe("제휴 연결 준비 중");
    expect(userStatus(row("manual_check"))?.text).toBe("직접 확인");
    expect(userStatus(row("ok", true))?.text).toBe("테스트 데이터");
    expect(userStatus(row("ok"))?.text).toBe("실시간 확인");
    expect(userStatus(row("deals_only", false, "deal"))?.text).toBe("공개 특가");
    expect(userStatus(row("deals_only", true, "deal"))?.text).toBe("테스트 데이터");
  });
  it("hides policy-skipped services from users entirely", () => {
    expect(userStatus(row("policy_skipped"))).toBeUndefined();
  });
  it("only states that carry data are marked as having data; problems read as one calm sentence", () => {
    for (const s of ["timeout", "error", "unavailable"] as const) expect(userStatus(row(s))).toMatchObject({ text: "현재 이 서비스의 가격을 확인할 수 없습니다.", hasData: false });
    expect(userStatus(row("ok"))?.hasData).toBe(true);
    expect(userStatus(row("manual_check"))?.hasData).toBe(false);
  });
  it("no user-facing text contains developer vocabulary", () => {
    for (const s of ALL) for (const demo of [true, false]) for (const role of ["flight", "deal"] as const) {
      const t = userStatus(row(s, demo, role))?.text ?? "";
      expect(t).not.toMatch(/API|KEY|LIVE|DEMO|MANUAL|POLICY|PARTNER|background|polling|provider/i);
    }
  });
  it("the admin keeps the developer labels", () => {
    expect(adminBadge(row("api_required"))).toBe("API REQUIRED");
    expect(adminBadge(row("ok"))).toBe("LIVE");
    expect(adminBadge(row("ok", true))).toBe("DEMO");
  });
});

describe("user screens do not contain developer vocabulary", () => {
  const FILES = [
    "src/app/page.tsx",
    "src/app/search/page.tsx",
    "src/app/watchlist/page.tsx",
    "src/app/watchlist/[id]/page.tsx",
    "src/app/settings/notifications/page.tsx",
    "src/components/SearchForm.tsx",
    "src/components/SearchRunner.tsx",
    "src/components/ResultCards.tsx",
    "src/components/TrackCta.tsx",
    "src/components/WatchlistCard.tsx",
    "src/components/WatchlistActions.tsx",
    "src/components/NotificationSettingsForm.tsx",
    "src/components/DemoBadge.tsx",
    "src/components/Pill.tsx",
    "src/app/layout.tsx",
  ];
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  it.each(FILES)("%s", (f) => {
    const code = strip(readFileSync(path.resolve(__dirname, "..", f), "utf8"));
    // Visible words only: UI strings (quoted text and JSX text), not identifiers.
    const visible = [...code.matchAll(/"([^"\n]*[가-힣A-Za-z][^"\n]*)"|>([^<>{}\n]*[가-힣A-Za-z][^<>{}\n]*)</g)].map((m) => m[1] ?? m[2]).join("\n");
    expect(visible).not.toMatch(/API REQUIRED|\bAPI\b|PARTNER REQUIRED|POLICY|MANUAL|LIVE|DEMO|polling|background|백그라운드|Provider|DATABASE_URL|TELEGRAM_|CRON_SECRET|정책|메모리|Dry Run|ADMIN|Telegram|텔레그램|Cron|Database|데이터베이스/);
  });
  it("the public navigation has no admin links", () => {
    const layout = readFileSync(path.resolve(__dirname, "../src/app/layout.tsx"), "utf8");
    expect(layout).not.toContain("/admin");
  });
});

describe("date comparison (날짜 ±3일)", () => {
  const today = "2026-10-07";
  it("slides the whole trip, keeps its length, never includes the chosen day", () => {
    const d = shiftedDates({ departureDate: "2026-11-12", returnDate: "2026-11-15" }, 3, today);
    expect(d.map((x) => x.offset)).toEqual([-3, -2, -1, 1, 2, 3]);
    expect(d[0]).toMatchObject({ departureDate: "2026-11-09", returnDate: "2026-11-12" });
    expect(d[5]).toMatchObject({ departureDate: "2026-11-15", returnDate: "2026-11-18" });
  });
  it("drops combinations in the past and supports one-way", () => {
    expect(shiftedDates({ departureDate: "2026-10-08", returnDate: "2026-10-11" }, 3, today).map((x) => x.offset)).toEqual([-1, 1, 2, 3]);
    expect(shiftedDates({ departureDate: "2026-11-12" }, 1, today)).toEqual([
      { offset: -1, departureDate: "2026-11-11", returnDate: undefined },
      { offset: 1, departureDate: "2026-11-13", returnDate: undefined },
    ]);
  });
  const res = (price: number): SourceResult => {
    const [o] = demoOffers("x");
    return {
      run: { provider: "x", displayName: "x", role: "flight", checkUrl: "https://x", checkLabel: "x", directUrl: "https://x", status: "ok", isDemo: false, excluded: false, flightCount: 1, dealCount: 0, elapsedMs: 0, cached: false, lastAttemptAt: "2026-10-07T00:00:00Z" },
      offers: [{ ...o!, isDemo: false, sourceType: "api", pricePerPerson: price, totalPrice: price * 2 }],
      deals: [],
    };
  };
  it("takes the cheapest price of a date across services; a date without results has no price", () => {
    const shifted = { offset: -1, departureDate: "2026-11-11", returnDate: "2026-11-14" };
    expect(cheapestForDates(request, shifted, [res(200000), res(179000)])).toMatchObject({ offset: -1, price: 179000, isDemo: false });
    expect(cheapestForDates(request, shifted, []).price).toBeUndefined();
  });
  it("reports the best saving only against the same data mode", () => {
    const others = [
      { offset: -1, departureDate: "a", price: 150000, isDemo: false },
      { offset: 1, departureDate: "b", price: 160000, isDemo: false },
      { offset: 2, departureDate: "c", price: 100000, isDemo: true }, // demo price must not "beat" a real one
      { offset: 3, departureDate: "d", price: undefined, isDemo: false },
    ];
    expect(bestSaving({ price: 169000, isDemo: false }, others)).toMatchObject({ savingPerPerson: 19000, date: { offset: -1 } });
    expect(bestSaving({ price: 140000, isDemo: false }, others)).toBeUndefined();
    expect(bestSaving({ price: undefined, isDemo: false }, others)).toBeUndefined();
  });
  it("the search URL accepts flex=3 and defaults to 0", () => {
    const base = { origin: "ICN", destination: "NRT", departureDate: "2026-11-12", returnDate: "2026-11-15" };
    expect(parseSearchParams({ ...base, flex: "3" }).success && parseSearchParams({ ...base, flex: "3" }).data?.flex).toBe(3);
    expect(parseSearchParams(base).success && parseSearchParams(base).data?.flex).toBe(0);
    expect(parseSearchParams({ ...base, flex: "9" }).success).toBe(false);
  });
});

describe("place names", () => {
  it("airports, metro codes and unknown labels", () => {
    expect(placeName("ICN")).toBe("서울");
    expect(placeName("NRT")).toBe("도쿄");
    expect(placeName("TYO")).toBe("도쿄");
    expect(placeName("세부")).toBe("세부");
    expect(placeName(undefined)).toBe("");
  });
});

describe("/admin is hidden from ordinary visitors", () => {
  const basic = (pw: string) => `Basic ${Buffer.from(`admin:${pw}`).toString("base64")}`;
  it("production without a password → 404 (the area does not exist)", () => {
    expect(adminAccess({ nodeEnv: "production" })).toBe("hidden");
    expect(adminAccess({ nodeEnv: "development" })).toBe("allow");
  });
  it("with a password → Basic auth required; wrong / missing / malformed are challenged", () => {
    const base = { password: "s3cret", nodeEnv: "production" };
    expect(adminAccess({ ...base, authorization: basic("s3cret") })).toBe("allow");
    expect(adminAccess({ ...base, authorization: basic("wrong") })).toBe("challenge");
    expect(adminAccess({ ...base, authorization: basic("s3cre") })).toBe("challenge");
    expect(adminAccess({ ...base })).toBe("challenge");
    expect(adminAccess({ ...base, authorization: "Bearer s3cret" })).toBe("challenge");
    expect(adminAccess({ ...base, authorization: "Basic %%%" })).toBe("challenge");
  });
  it("the proxy applies it (404 / 401 with challenge / pass-through)", () => {
    vi.stubEnv("ADMIN_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "production");
    const req = (auth?: string) => new NextRequest("http://localhost/admin/providers", { headers: auth ? { authorization: auth } : {} });
    expect(proxy(req()).status).toBe(404);
    vi.stubEnv("ADMIN_PASSWORD", "s3cret");
    const denied = proxy(req());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");
    expect(proxy(req(basic("bad"))).status).toBe(401);
    expect(proxy(req(basic("s3cret"))).status).toBe(200);
  });
});
