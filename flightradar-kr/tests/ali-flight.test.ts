import { afterEach, describe, expect, it, vi } from "vitest";
import { AliFlightProvider } from "@/providers/ali-flight";
import { runFlyaiCli } from "@/providers/ali-flight/cli";
import { mapFlyaiResponse, parseCnyPrice, parseZhDuration } from "@/providers/ali-flight/mapper";
import type { FlyaiFlightResponse } from "@/providers/ali-flight/types";
import { ProviderUnavailableError } from "@/providers/types";
import { runSearch } from "@/features/flight-search/engine";
import fixture from "./fixtures/flyai-search-flight.json";
import { query, request } from "./helpers";

afterEach(() => vi.unstubAllEnvs());
vi.spyOn(console, "info").mockImplementation(() => {});
const res = fixture as unknown as FlyaiFlightResponse;
const NOW = "2026-10-07T00:00:00Z";

describe("flyai parsing helpers", () => {
  it("parses CNY prices and zh durations", () => {
    expect(parseCnyPrice("¥1,180.0")).toBe(1180);
    expect(parseCnyPrice("价格待定")).toBeUndefined();
    expect(parseCnyPrice(undefined)).toBeUndefined();
    expect(parseZhDuration("140分钟")).toBe(140);
    expect(parseZhDuration("2小时25分钟")).toBe(145);
    expect(parseZhDuration("abc")).toBeUndefined();
  });
});

describe("flyai mapper (fixture)", () => {
  it("maps a direct round trip in CNY with the exact airport pair", () => {
    const offers = mapFlyaiResponse(res, query, NOW);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      provider: "ali-flight",
      isDemo: false,
      currency: "CNY",
      pricePerPerson: 1180,
      totalPrice: 2360,
      originAirport: "ICN",
      destinationAirport: "NRT",
      departureAt: "2026-11-12T08:20:00+09:00",
      returnDepartureAt: "2026-11-15T18:30:00+09:00",
      airline: "济州航空",
      outboundFlightNumber: "7C1102",
      stops: 0,
      totalDurationMinutes: 305,
      bookingUrl: "https://example.com/fliggy/book/1",
      sourceType: "api",
    });
  });

  it("keeps only the requested airport pair and skips round trips without an inbound journey", () => {
    expect(mapFlyaiResponse(res, { ...query, origin: "GMP", destination: "HND" }, NOW)).toHaveLength(0); // GMP→HND is one-way only in fixture
    const oneWay = mapFlyaiResponse(res, { ...query, origin: "GMP", destination: "HND", returnDate: undefined }, NOW);
    expect(oneWay).toHaveLength(1);
    expect(oneWay[0]?.stops).toBe(1);
  });

  it("skips non-https links and unparseable prices (never invents values)", () => {
    const all = mapFlyaiResponse(res, { ...query, returnDate: undefined }, NOW);
    expect(all.every((o) => o.bookingUrl.startsWith("https://"))).toBe(true);
  });

  it("applies directOnly", () => {
    expect(mapFlyaiResponse(res, { ...query, origin: "GMP", destination: "HND", returnDate: undefined, directOnly: true }, NOW)).toHaveLength(0);
  });
});

describe("flyai CLI runner", () => {
  const ok = (stdout: string) => (_f: string, _a: string[], _o: object, cb: (e: null, out: string, err: string) => void) => cb(null, stdout, "");
  it("parses JSON stdout and passes args without a shell", async () => {
    const exec = vi.fn(ok(JSON.stringify(fixture)));
    const out = await runFlyaiCli(["search-flight", "--origin", "首尔"], { binary: "flyai", timeoutMs: 1000, execFileImpl: exec });
    expect(out.data?.itemList).toHaveLength(4);
    expect(exec.mock.calls[0]![0]).toBe("flyai");
    expect(exec.mock.calls[0]![1]).toEqual(["search-flight", "--origin", "首尔"]);
  });
  it("reports a missing binary as unavailable", async () => {
    const exec = (_f: string, _a: string[], _o: object, cb: (e: Error & { code?: string }, o: string, e2: string) => void) => cb(Object.assign(new Error("x"), { code: "ENOENT" }), "", "");
    await expect(runFlyaiCli([], { binary: "nope", timeoutMs: 10, execFileImpl: exec })).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("rejects non-JSON output and non-zero status", async () => {
    await expect(runFlyaiCli([], { binary: "x", timeoutMs: 10, execFileImpl: ok("oops") })).rejects.toThrow(/non-JSON/);
    await expect(runFlyaiCli([], { binary: "x", timeoutMs: 10, execFileImpl: ok('{"status":3}') })).rejects.toThrow(/status 3/);
  });
});

describe("AliFlightProvider gating", () => {
  it("is manual_check by default (no opt-in, no demo)", async () => {
    vi.stubEnv("ALI_PROVIDER_MODE", "");
    vi.stubEnv("DEMO_MODE", "");
    const err = await new AliFlightProvider().searchFlights(query).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.status).toBe("manual_check");
  });
  it("requires an explicit FX rate once opted in", async () => {
    vi.stubEnv("ALI_PROVIDER_MODE", "flyai");
    vi.stubEnv("FX_CNY_KRW", "");
    const err = await new AliFlightProvider().searchFlights(query).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(String(err.message)).toContain("FX_CNY_KRW");
  });
});

describe("CNY offers are converted on the server", () => {
  it("runSource converts CNY→KRW with the supplied rate; without it the offers are dropped", async () => {
    const provider = { name: "ali-flight", displayName: "알리항공권", isEnabled: () => true, isDemo: () => false, searchFlights: async () => mapFlyaiResponse(res, query, NOW), healthCheck: async () => ({ provider: "ali-flight", status: "connected" as const, checkedAt: NOW }) };
    const source = { name: "ali-flight", displayName: "알리항공권", checkUrl: "https://example.com", checkLabel: "x", directUrl: () => "https://example.com", flight: provider };
    const withRate = await runSearch(request, { sources: [source], timeoutMs: 100, fxRates: { CNY: 190 } });
    expect(withRate.sources[0]?.status).toBe("ok");
    expect(withRate.sources[0]?.bestOffer).toMatchObject({ currency: "KRW", pricePerPerson: 1180 * 190 });
    const without = await runSearch(request, { sources: [source], timeoutMs: 100 });
    expect(without.sources[0]?.status).toBe("no_results");
  });
});
