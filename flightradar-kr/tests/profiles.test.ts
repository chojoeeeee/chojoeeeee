import { describe, expect, it } from "vitest";
import { badgeFor } from "@/components/SourceBadge";
import { CHECKED_AT, SOURCE_PROFILES } from "@/config/source-profiles";
import { getSources } from "@/providers/sources";

describe("source research profiles", () => {
  it("cover exactly the six registered sources", () => {
    expect(SOURCE_PROFILES.map((p) => p.name).sort()).toEqual(getSources().map((s) => s.name).sort());
    expect(SOURCE_PROFILES).toHaveLength(6);
  });

  it("each has an official URL, evidence with URLs, a robots URL marked UNVERIFIED, and a next step", () => {
    for (const p of SOURCE_PROFILES) {
      expect(p.officialUrl).toMatch(/^https:\/\//);
      expect(p.evidence.length).toBeGreaterThanOrEqual(3);
      for (const e of p.evidence) expect(e.url).toMatch(/^https:\/\//);
      expect(p.robotsUrl).toMatch(/\/robots\.txt$/);
      expect(p.robotsStatus).toBe("UNVERIFIED");
      expect(p.nextStep.length).toBeGreaterThan(10);
      expect(p.connectionLabel.length).toBeGreaterThan(5);
    }
    expect(CHECKED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("source check links match the researched official sites", () => {
    const urls = Object.fromEntries(getSources().map((s) => [s.name, s.checkUrl]));
    expect(urls.catchfrog).toBe("https://catchfrog.ai");
    expect(urls.playwings).toBe("https://www.playwings.co.kr");
    expect(urls.chulguk).toBe("https://godflight.com");
  });

  it("uses the confirmed Playwings name everywhere", () => {
    expect(getSources().find((s) => s.name === "playwings")?.displayName).toBe("플레이윙즈 (Playwings)");
    expect(JSON.stringify(SOURCE_PROFILES)).not.toContain("플라이윙즈");
  });

  it("Trip.com is classified B (partner approval) with Flight API evidence", () => {
    const trip = SOURCE_PROFILES.find((p) => p.name === "trip")!;
    expect(trip.reachability).toBe("B");
    expect(trip.officialApi).toBe("yes");
    expect(trip.evidence.some((e) => e.url.includes("developers.trip.com/flight"))).toBe(true);
  });
});

describe("status badges", () => {
  it("never labels demo or unavailable data as LIVE", () => {
    expect(badgeFor({ status: "ok", isDemo: false })).toBe("LIVE");
    expect(badgeFor({ status: "no_results", isDemo: false })).toBe("LIVE");
    expect(badgeFor({ status: "ok", isDemo: true })).toBe("DEMO");
    expect(badgeFor({ status: "deals_only", isDemo: true })).toBe("DEMO");
    expect(badgeFor({ status: "manual_check", isDemo: false })).toBe("MANUAL");
    expect(badgeFor({ status: "api_required", isDemo: false })).toBe("API REQUIRED");
    expect(badgeFor({ status: "partner_required", isDemo: false })).toBe("PARTNER REQUIRED");
    for (const s of ["timeout", "error", "unavailable"] as const) expect(badgeFor({ status: s, isDemo: false })).toBe("ERROR");
  });
});
