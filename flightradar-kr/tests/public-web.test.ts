import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOT_USER_AGENT, clearPublicFetchCache, fetchPublicHtml } from "@/providers/public-web";
import { ProviderUnavailableError } from "@/providers/types";

beforeEach(() => clearPublicFetchCache());

function site(map: Record<string, { status?: number; body?: string } | "network-error">) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    const r = map[u];
    if (!r || r === "network-error") throw new Error("network");
    return new Response(r.body ?? "", { status: r.status ?? 200 });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}
const opts = (f: typeof fetch) => ({ provider: "x", url: "https://example.com/deals", fetchImpl: f });

describe("fetchPublicHtml (polite, robots-aware)", () => {
  it("reads robots.txt first, identifies itself, then fetches the page", async () => {
    const s = site({ "https://example.com/robots.txt": { body: "User-agent: *\nDisallow: /admin" }, "https://example.com/deals": { body: "<html>ok</html>" } });
    expect(await fetchPublicHtml(opts(s.impl))).toBe("<html>ok</html>");
    expect(s.calls.map((c) => c.url)).toEqual(["https://example.com/robots.txt", "https://example.com/deals"]);
    expect(s.calls[1]!.headers["user-agent"]).toBe(BOT_USER_AGENT);
  });
  it("does NOT fetch the page when robots.txt disallows it", async () => {
    const s = site({ "https://example.com/robots.txt": { body: "User-agent: *\nDisallow: /" }, "https://example.com/deals": { body: "secret" } });
    const err = await fetchPublicHtml(opts(s.impl)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderUnavailableError);
    expect(err.status).toBe("manual_check");
    expect(s.calls.map((c) => c.url)).toEqual(["https://example.com/robots.txt"]);
  });
  it("treats a missing robots.txt (404) as no restrictions", async () => {
    const s = site({ "https://example.com/robots.txt": { status: 404 }, "https://example.com/deals": { body: "ok" } });
    expect(await fetchPublicHtml(opts(s.impl))).toBe("ok");
  });
  it("stops when robots.txt cannot be checked (5xx / network error) instead of assuming permission", async () => {
    for (const robots of [{ status: 503 }, "network-error"] as const) {
      clearPublicFetchCache();
      const s = site({ "https://example.com/robots.txt": robots, "https://example.com/deals": { body: "ok" } });
      const err = await fetchPublicHtml(opts(s.impl)).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect(s.calls.map((c) => c.url)).not.toContain("https://example.com/deals");
    }
  });
  it("caches the page so repeated searches do not hit the site again", async () => {
    let t = 1000;
    const s = site({ "https://example.com/robots.txt": { body: "" }, "https://example.com/deals": { body: "ok" } });
    await fetchPublicHtml({ ...opts(s.impl), now: () => t, cacheTtlMs: 60_000 });
    t += 30_000;
    await fetchPublicHtml({ ...opts(s.impl), now: () => t, cacheTtlMs: 60_000 });
    expect(s.calls).toHaveLength(2); // robots + page once
    t += 60_000;
    await fetchPublicHtml({ ...opts(s.impl), now: () => t, cacheTtlMs: 60_000 });
    expect(s.calls).toHaveLength(4);
  });
  it("rejects HTTP errors and oversized pages", async () => {
    const bad = site({ "https://example.com/robots.txt": { body: "" }, "https://example.com/deals": { status: 500 } });
    await expect(fetchPublicHtml(opts(bad.impl))).rejects.toThrow(/HTTP 500/);
    clearPublicFetchCache();
    const big = site({ "https://example.com/robots.txt": { body: "" }, "https://example.com/deals": { body: "x".repeat(50) } });
    await expect(fetchPublicHtml({ ...opts(big.impl), maxBytes: 10 })).rejects.toThrow(/too large/);
  });
});
