import { describe, expect, it, vi } from "vitest";
import { createMemoryCache } from "@/features/flight-search/cache";
import { expandQueries, runSearch } from "@/features/flight-search/engine";
import { ProviderUnavailableError } from "@/providers/types";
import { demoOffers, deal, fakeSource, realOffer, request } from "./helpers";

vi.spyOn(console, "info").mockImplementation(() => {});

const ok = (n: string) => fakeSource(n, { flight: async () => demoOffers(n) });
const row = (res: Awaited<ReturnType<typeof runSearch>>, name: string) => res.sources.find((s) => s.provider === name)!;

describe("all sources are always attempted and always shown", () => {
  it("shows every source even when some fail, time out or are unavailable", async () => {
    const res = await runSearch(request, {
      timeoutMs: 40,
      sources: [
        ok("a"),
        fakeSource("boom", { flight: async () => { throw new Error("HTTP 500"); } }),
        fakeSource("slow", { flight: () => new Promise(() => {}) }),
        fakeSource("manual", {
          flight: async () => { throw new ProviderUnavailableError("manual", "manual_check", "auto lookup not possible"); },
          deal: async () => { throw new ProviderUnavailableError("manual", "manual_check", "auto lookup not possible"); },
        }),
        fakeSource("nokey", { flight: async () => { throw new ProviderUnavailableError("nokey", "api_required", "key"); } }),
        fakeSource("empty", { flight: async () => [] }),
      ],
    });
    expect(res.sources.map((s) => s.provider)).toEqual(["a", "boom", "slow", "manual", "nokey", "empty"]);
    expect(res.sources.map((s) => s.status)).toEqual(["ok", "error", "timeout", "manual_check", "api_required", "no_results"]);
    expect(res.summary).toEqual({ total: 6, confirmed: 1 });
    // every non-ok source keeps a link and a last-attempt time
    for (const s of res.sources) {
      expect(s.directUrl).toContain("https://");
      expect(Date.parse(s.lastAttemptAt)).not.toBeNaN();
    }
  });

  it("one failing source never changes the others' results", async () => {
    const good = ok("good");
    const withFail = await runSearch(request, { timeoutMs: 100, sources: [good, fakeSource("bad", { flight: async () => { throw new Error("x"); } })] });
    const alone = await runSearch(request, { timeoutMs: 100, sources: [good] });
    expect(withFail.groups.map((g) => g.best.pricePerPerson)).toEqual(alone.groups.map((g) => g.best.pricePerPerson));
  });

  it("does not fail when every source fails", async () => {
    const res = await runSearch(request, { timeoutMs: 50, sources: [fakeSource("a", { flight: async () => { throw new Error("x"); } })] });
    expect(res.groups).toEqual([]);
    expect(res.summary.confirmed).toBe(0);
    expect(res.sources).toHaveLength(1);
  });

  it("a timeout is bounded and aborts the provider's signal", async () => {
    let aborted = false;
    const started = Date.now();
    const res = await runSearch(request, {
      timeoutMs: 30,
      sources: [fakeSource("slow", { flight: (_q, ctx) => new Promise(() => ctx?.signal?.addEventListener("abort", () => (aborted = true))) })],
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(aborted).toBe(true);
    expect(row(res, "slow").status).toBe("timeout");
  });

  it("redacts credentials from errors", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((m: string) => void logged.push(m));
    await runSearch(request, { timeoutMs: 50, sources: [fakeSource("a", { flight: async () => { throw new Error("bad api_key=SECRET123"); } })] });
    spy.mockRestore();
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(logged.join("\n")).not.toContain("SECRET123");
  });
});

describe("source status resolution", () => {
  it("deals only → deals_only; flights win over deals", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      sources: [
        fakeSource("pw", { deal: async () => [deal({ isDemo: true })], flight: async () => { throw new ProviderUnavailableError("pw", "manual_check", "m"); } }),
        fakeSource("both", { deal: async () => [deal({ id: "x", provider: "both", isDemo: true })], flight: async () => demoOffers("both") }),
      ],
    });
    expect(row(res, "pw").status).toBe("deals_only");
    expect(row(res, "pw").bestDeal?.price).toBe(129000);
    expect(row(res, "both").status).toBe("ok");
    expect(res.summary.confirmed).toBe(2);
  });

  it("technical failure of one part outranks 'manual' of the other", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      sources: [fakeSource("x", { flight: async () => { throw new Error("boom"); }, deal: async () => { throw new ProviderUnavailableError("x", "manual_check", "m"); } })],
    });
    expect(row(res, "x").status).toBe("error");
  });

  it("a successful empty part makes the source no_results, not an error", async () => {
    const res = await runSearch(request, { timeoutMs: 100, sources: [fakeSource("x", { flight: async () => [], deal: async () => { throw new ProviderUnavailableError("x", "manual_check", "m"); } })] });
    expect(row(res, "x").status).toBe("no_results");
  });
});

describe("price comparison across sources", () => {
  it("ranks sources and reports the difference from the cheapest", async () => {
    const mk = (n: string, bias: number) => fakeSource(n, { flight: async () => demoOffers(n, bias) });
    const res = await runSearch(request, { timeoutMs: 100, sources: [mk("c", 1.2), mk("a", 1), mk("b", 1.1)] });
    const ranked = res.sources.filter((s) => s.rank).sort((x, y) => x.rank! - y.rank!);
    expect(ranked.map((s) => s.provider)).toEqual(["a", "b", "c"]);
    expect(ranked[0]?.diffFromBest).toBe(0);
    expect(ranked[1]!.diffFromBest).toBe(ranked[1]!.bestOffer!.pricePerPerson - ranked[0]!.bestOffer!.pricePerPerson);
    expect(res.recommendations.cheapest?.best.provider).toBe("a");
  });
});

describe("data integrity", () => {
  it("flags all-demo results as demo mode", async () => {
    const res = await runSearch(request, { timeoutMs: 100, sources: [ok("a")] });
    expect(res.dataMode).toBe("demo");
    expect(res.groups.every((g) => g.best.isDemo)).toBe(true);
  });

  it("never mixes demo with real: demo sources stay listed but are excluded", async () => {
    const res = await runSearch(request, {
      timeoutMs: 100,
      sources: [fakeSource("real", { flight: async () => [realOffer({ provider: "real" })], demo: false }), ok("demo")],
    });
    expect(res.dataMode).toBe("live");
    expect(res.groups.flatMap((g) => g.offers).every((o) => !o.isDemo)).toBe(true);
    expect(res.sources).toHaveLength(2);
    expect(row(res, "demo").excluded).toBe(true);
    expect(row(res, "demo").bestOffer).toBeUndefined();
    expect(res.summary).toEqual({ total: 2, confirmed: 1 });
  });

  it("caches identical searches but never caches failures", async () => {
    const impl = vi.fn(async () => demoOffers("a"));
    const cache = createMemoryCache<ReturnType<typeof demoOffers>>(60_000);
    const deps = { timeoutMs: 100, cache, sources: [fakeSource("a", { flight: impl })] };
    await runSearch(request, deps);
    const second = await runSearch(request, deps);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(row(second, "a").cached).toBe(true);

    const failing = vi.fn(async () => { throw new Error("x"); });
    const c2 = createMemoryCache<ReturnType<typeof demoOffers>>(60_000);
    const d2 = { timeoutMs: 100, cache: c2, sources: [fakeSource("f", { flight: failing })] };
    await runSearch(request, d2);
    await runSearch(request, d2);
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("source stays ok if only some airport pairs fail", async () => {
    const res = await runSearch(
      { ...request, destinations: ["NRT", "HND"] },
      { timeoutMs: 100, sources: [fakeSource("p", { flight: async (q) => { if (q.destination === "HND") throw new Error("x"); return demoOffers("p"); } })] },
    );
    expect(row(res, "p").status).toBe("ok");
  });
});

describe("expandQueries", () => {
  it("expands nearby airports into pairs", () => {
    const qs = expandQueries({ ...request, origins: ["ICN", "GMP"], destinations: ["NRT", "HND"] });
    expect(qs.map((q) => `${q.origin}-${q.destination}`)).toEqual(["ICN-NRT", "ICN-HND", "GMP-NRT", "GMP-HND"]);
  });
  it("supports one-way", () => {
    expect(expandQueries({ ...request, returnDate: undefined })[0]?.returnDate).toBeUndefined();
  });
});
