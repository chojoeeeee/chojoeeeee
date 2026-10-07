import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "@/features/flight-search/cache";
import { expandQueries, runSearch } from "@/features/flight-search/engine";
import { ProviderUnavailableError } from "@/providers/types";
import { demoOffers, fakeProvider, realOffer, request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});

describe("search engine: provider isolation", () => {
  it("returns results from healthy providers when one throws", async () => {
    const res = await runSearch(request, {
      timeoutMs: 500,
      providers: [
        fakeProvider("ok", async () => demoOffers("ok")),
        fakeProvider("boom", async () => {
          throw new Error("HTTP 500");
        }),
      ],
    });
    expect(res.groups.length).toBeGreaterThan(0);
    expect(res.summary).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(res.providers.find((p) => p.provider === "boom")?.status).toBe("error");
  });

  it("marks a hanging provider as timeout without blocking the search", async () => {
    const started = Date.now();
    const res = await runSearch(request, {
      timeoutMs: 50,
      providers: [
        fakeProvider("ok", async () => demoOffers("ok")),
        fakeProvider("slow", () => new Promise(() => {})),
      ],
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(res.providers.find((p) => p.provider === "slow")?.status).toBe("timeout");
    expect(res.summary.succeeded).toBe(1);
  });

  it("aborts the signal passed to a timed-out provider", async () => {
    let aborted = false;
    await runSearch(request, {
      timeoutMs: 30,
      providers: [fakeProvider("slow", (_q, ctx) => new Promise(() => ctx?.signal?.addEventListener("abort", () => (aborted = true))))],
    });
    expect(aborted).toBe(true);
  });

  it("reports unavailable providers distinctly", async () => {
    const res = await runSearch(request, {
      timeoutMs: 500,
      providers: [
        fakeProvider("ok", async () => demoOffers("ok")),
        fakeProvider("trip", async () => {
          throw new ProviderUnavailableError("trip", "partner_required", "no approval");
        }),
      ],
    });
    expect(res.providers.find((p) => p.provider === "trip")?.status).toBe("unavailable");
  });

  it("does not fail when every provider fails", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      providers: [fakeProvider("a", async () => { throw new Error("x"); })],
    });
    expect(res.groups).toEqual([]);
    expect(res.summary.succeeded).toBe(0);
  });

  it("redacts credentials from provider error messages", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      providers: [fakeProvider("a", async () => { throw new Error("bad request api_key=SECRET123"); })],
    });
    expect(res.providers[0]?.error).not.toContain("SECRET123");
  });
});

describe("search engine: data integrity", () => {
  it("flags all-demo results as demo mode", async () => {
    const res = await runSearch(request, { timeoutMs: 100, providers: [fakeProvider("a", async () => demoOffers("a"))] });
    expect(res.dataMode).toBe("demo");
    expect(res.groups.every((g) => g.best.isDemo)).toBe(true);
  });

  it("never mixes demo offers with real offers", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      providers: [
        fakeProvider("real", async () => [realOffer({ provider: "real" })], false),
        fakeProvider("demo", async () => demoOffers("demo")),
      ],
    });
    expect(res.dataMode).toBe("live");
    expect(res.groups.flatMap((g) => g.offers).every((o) => !o.isDemo)).toBe(true);
    expect(res.providers.find((p) => p.provider === "demo")?.excluded).toBe(true);
    expect(res.summary.total).toBe(1);
  });

  it("uses the cache for identical searches and skips failures", async () => {
    const impl = vi.fn(async () => demoOffers("a"));
    const cache = createMemoryCache<ReturnType<typeof demoOffers>>(60_000);
    const deps = { timeoutMs: 100, cache, providers: [fakeProvider("a", impl)] };
    await runSearch(request, deps);
    const second = await runSearch(request, deps);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(second.providers[0]?.cached).toBe(true);

    const failing = vi.fn(async () => { throw new Error("x"); });
    const cache2 = createMemoryCache<ReturnType<typeof demoOffers>>(60_000);
    await runSearch(request, { timeoutMs: 100, cache: cache2, providers: [fakeProvider("f", failing)] });
    await runSearch(request, { timeoutMs: 100, cache: cache2, providers: [fakeProvider("f", failing)] });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("keeps a provider healthy if only some airport pairs fail", async () => {
    const res = await runSearch(
      { ...request, destinations: ["NRT", "HND"] },
      {
        timeoutMs: 100,
        providers: [fakeProvider("p", async (q) => { if (q.destination === "HND") throw new Error("x"); return demoOffers("p"); })],
      },
    );
    expect(res.providers[0]?.status).toBe("ok");
  });
});

describe("expandQueries", () => {
  it("expands nearby airports into pairs", () => {
    const qs = expandQueries({ ...request, origins: ["ICN", "GMP"], destinations: ["NRT", "HND"] });
    expect(qs.map((q) => `${q.origin}-${q.destination}`)).toEqual(["ICN-NRT", "ICN-HND", "GMP-NRT", "GMP-HND"]);
  });
  it("supports one-way", () => {
    const [q] = expandQueries({ ...request, returnDate: undefined });
    expect(q?.returnDate).toBeUndefined();
  });
});
