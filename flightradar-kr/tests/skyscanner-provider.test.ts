import { afterEach, describe, expect, it, vi } from "vitest";
import { runSearch } from "@/features/flight-search/engine";
import { SkyscannerProvider } from "@/providers/skyscanner";
import { ProviderUnavailableError } from "@/providers/types";
import complete from "./fixtures/skyscanner-live-response.json";
import partial from "./fixtures/skyscanner-create-incomplete.json";
import { query, request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

describe("SkyscannerProvider: key in → real search works", () => {
  it("without a key (and no DEMO_MODE) reports api_required instead of inventing data", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "");
    vi.stubEnv("DEMO_MODE", "");
    const p = new SkyscannerProvider();
    expect(p.isDemo()).toBe(false);
    const err = await p.searchFlights(query).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.status).toBe("api_required");
    expect((await p.healthCheck()).status).toBe("api_required");
  });

  it("with a key it calls create then poll and returns LIVE offers (never demo)", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "TESTKEY");
    vi.stubEnv("DEMO_MODE", "true"); // even with DEMO_MODE, a real key must win
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return json(calls.length === 1 ? partial : complete);
    }));
    const p = new SkyscannerProvider();
    expect(p.isDemo()).toBe(false);
    const offers = await p.searchFlights(query);
    expect(calls.map((u) => u.split("/").slice(-2).join("/"))).toEqual(["search/create", "poll/tok-123"]);
    expect(offers).toHaveLength(3);
    expect(offers.every((o) => !o.isDemo && o.sourceType === "api" && o.provider === "skyscanner")).toBe(true);
    expect((await p.healthCheck()).status).toBe("connected");
  });

  it("through the engine: LIVE offers are shown and a Skyscanner key rejection becomes api_required", async () => {
    vi.stubEnv("SKYSCANNER_API_KEY", "TESTKEY");
    vi.stubGlobal("fetch", vi.fn(async () => json(complete)));
    const source = { role: "flight" as const, name: "skyscanner", displayName: "Skyscanner", checkUrl: "https://www.skyscanner.co.kr", checkLabel: "x", directUrl: () => "https://x", flight: new SkyscannerProvider() };
    const ok = await runSearch(request, { sources: [source], timeoutMs: 1000 });
    expect(ok.dataMode).toBe("live");
    expect(ok.sources[0]).toMatchObject({ status: "ok", isDemo: false });
    expect(ok.sources[0]?.bestOffer?.seller).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 403 })));
    const denied = await runSearch(request, { sources: [source], timeoutMs: 1000 });
    expect(denied.sources[0]?.status).toBe("api_required");
  });
});
