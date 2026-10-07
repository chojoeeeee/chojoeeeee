import { describe, expect, it } from "vitest";
import { evaluateAlerts, nextAlertState, type EvaluateInput } from "@/features/alerts/evaluate";
import { buildAlertMessages, formatKst } from "@/features/alerts/message";
import { relatedDeals } from "@/features/deal-engine/related";
import { dealScore } from "@/features/price-history/stats";
import { defaultNotificationSettings, emptyAlertState } from "@/features/watchlist/types";
import { deal, request } from "./helpers";

const NOW = new Date("2026-10-07T09:32:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function input(over: Partial<EvaluateInput> = {}): EvaluateInput {
  return {
    watchlist: { targetPrice: 170000, alertPriceDropPercent: 5, alertNewLow: true, registeredPrice: 189000, registeredIsDemo: false },
    settings: defaultNotificationSettings("u"),
    previousPrice: 189000,
    currentPrice: 169000,
    currentIsDemo: false,
    history: [189000],
    state: emptyAlertState("w"),
    now: NOW,
    ...over,
  };
}
const types = (d: ReturnType<typeof evaluateAlerts>) => d.filter((x) => x.shouldNotify).map((x) => x.type).sort();

describe("alert conditions", () => {
  it("189,000 → 169,000 with target 170,000: target reached + drop + new low", () => {
    expect(types(evaluateAlerts(input()))).toEqual(["NEW_LOW", "PRICE_DROP", "TARGET_REACHED"]);
  });
  it("target is notified only the FIRST time it is reached", () => {
    const first = evaluateAlerts(input());
    const state = nextAlertState(emptyAlertState("w"), { notified: first.filter((d) => d.shouldNotify), currentPrice: 169000, currentIsDemo: false, targetPrice: 170000, now: NOW });
    expect(state.targetActive).toBe(true);
    const again = evaluateAlerts(input({ state, previousPrice: 169000, history: [189000, 169000], now: new Date(NOW.getTime() + 7 * 3_600_000) }));
    expect(again.find((d) => d.type === "TARGET_REACHED")).toMatchObject({ shouldNotify: false, suppressedBy: "already_notified" });
  });
  it("target is re-armed once the price goes back above it", () => {
    let state = nextAlertState(emptyAlertState("w"), { notified: evaluateAlerts(input()).filter((d) => d.shouldNotify), currentPrice: 169000, currentIsDemo: false, targetPrice: 170000, now: NOW });
    state = nextAlertState(state, { notified: [], currentPrice: 180000, currentIsDemo: false, targetPrice: 170000, now: new Date(NOW.getTime() + 3_600_000) });
    expect(state.targetActive).toBe(false);
    const later = new Date(NOW.getTime() + 8 * 3_600_000);
    const d = evaluateAlerts(input({ state, currentPrice: 165000, previousPrice: 180000, history: [189000, 169000, 180000], now: later }));
    expect(d.find((x) => x.type === "TARGET_REACHED")?.shouldNotify).toBe(true);
  });
  it("price above target: no target alert", () => {
    expect(evaluateAlerts(input({ currentPrice: 175000 })).some((d) => d.type === "TARGET_REACHED")).toBe(false);
  });
  it("further drop vs the LAST NOTIFIED price: ≥5% or ≥10,000 KRW", () => {
    const state = { ...emptyAlertState("w"), lastNotifiedPrice: 190000, lastNotifiedIsDemo: false };
    const no = evaluateAlerts(input({ state, currentPrice: 189000, watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false } })); // 190,000 → 189,000: 0.5%, 1,000
    expect(no).toEqual([]);
    const pct = evaluateAlerts(input({ state: { ...state, lastNotifiedPrice: 400000 }, currentPrice: 379000, watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false, registeredPrice: undefined } })); // 5.25% (21,000)
    expect(types(pct)).toEqual(["PRICE_DROP"]);
    const abs = evaluateAlerts(input({ state: { ...state, lastNotifiedPrice: 190000 }, currentPrice: 180000, watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false } })); // 5.3% & 10,000
    expect(types(abs)).toEqual(["PRICE_DROP"]);
    const smallPctBigAmt = evaluateAlerts(input({ state: { ...state, lastNotifiedPrice: 1_000_000 }, currentPrice: 990000, watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false } })); // 1%, but 10,000
    expect(types(smallPctBigAmt)).toEqual(["PRICE_DROP"]);
  });
  it("before the first alert the baseline is the registered price", () => {
    const d = evaluateAlerts(input({ watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false }, currentPrice: 170000 }));
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ type: "PRICE_DROP", oldPrice: 189000, newPrice: 170000 });
  });
  it("a registered DEMO price is not a baseline for a LIVE price (no mixing)", () => {
    const d = evaluateAlerts(input({ watchlist: { ...input().watchlist, targetPrice: undefined, alertNewLow: false, registeredIsDemo: true }, currentIsDemo: false }));
    expect(d).toEqual([]);
  });
  it("new all-time low needs earlier history and a strictly lower price", () => {
    const w = { ...input().watchlist, targetPrice: undefined, registeredPrice: undefined };
    expect(types(evaluateAlerts(input({ watchlist: w, history: [], currentPrice: 150000 })))).toEqual([]); // nothing to compare
    expect(types(evaluateAlerts(input({ watchlist: w, history: [180000, 170000], currentPrice: 169000 })))).toEqual(["NEW_LOW"]);
    expect(types(evaluateAlerts(input({ watchlist: w, history: [180000, 170000], currentPrice: 170000 })))).toEqual([]); // equal is not new
    expect(types(evaluateAlerts(input({ watchlist: { ...w, alertNewLow: false }, history: [180000], currentPrice: 150000 })))).toEqual([]); // switched off
  });
  it("price rising or unchanged never alerts", () => {
    const w = { ...input().watchlist, targetPrice: undefined };
    expect(evaluateAlerts(input({ watchlist: w, currentPrice: 200000, previousPrice: 189000, history: [189000] }))).toEqual([]);
    expect(evaluateAlerts(input({ watchlist: w, currentPrice: 189000, previousPrice: 189000, history: [189000] }))).toEqual([]);
  });
});

describe("cooldown, settings and de-duplication", () => {
  it("same condition within the cooldown (6 h) is suppressed; after it, allowed again", () => {
    const state = { ...emptyAlertState("w"), lastByType: { NEW_LOW: hoursAgo(5) }, lastNotifiedPrice: 175000 };
    const w = { ...input().watchlist, targetPrice: undefined, registeredPrice: undefined };
    const within = evaluateAlerts(input({ watchlist: w, state, history: [175000], currentPrice: 160000 }));
    expect(within.find((d) => d.type === "NEW_LOW")).toMatchObject({ shouldNotify: false, suppressedBy: "cooldown" });
    const expired = evaluateAlerts(input({ watchlist: w, state: { ...state, lastByType: { NEW_LOW: hoursAgo(7) } }, history: [175000], currentPrice: 160000 }));
    expect(expired.find((d) => d.type === "NEW_LOW")?.shouldNotify).toBe(true);
  });
  it("cooldown length is configurable", () => {
    const state = { ...emptyAlertState("w"), lastByType: { NEW_LOW: hoursAgo(5) } };
    const w = { ...input().watchlist, targetPrice: undefined, registeredPrice: undefined };
    const settings = { ...defaultNotificationSettings("u"), cooldownHours: 2 };
    expect(evaluateAlerts(input({ watchlist: w, settings, state, history: [175000], currentPrice: 160000 })).find((d) => d.type === "NEW_LOW")?.shouldNotify).toBe(true);
  });
  it("cooldown is per alert type", () => {
    const state = { ...emptyAlertState("w"), lastByType: { TARGET_REACHED: hoursAgo(1) } };
    const d = evaluateAlerts(input({ state }));
    expect(d.find((x) => x.type === "TARGET_REACHED")?.shouldNotify).toBe(false);
    expect(d.find((x) => x.type === "NEW_LOW")?.shouldNotify).toBe(true);
  });
  it("disabled settings suppress without erasing the decision", () => {
    const off = evaluateAlerts(input({ settings: { ...defaultNotificationSettings("u"), enabled: false } }));
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((d) => !d.shouldNotify && d.suppressedBy === "disabled")).toBe(true);
    const noTarget = evaluateAlerts(input({ settings: { ...defaultNotificationSettings("u"), targetAlerts: false } }));
    expect(noTarget.find((d) => d.type === "TARGET_REACHED")).toMatchObject({ shouldNotify: false, suppressedBy: "disabled" });
  });
  it("nextAlertState records cooldown stamps and the last notified price (and mode)", () => {
    const decisions = evaluateAlerts(input()).filter((d) => d.shouldNotify);
    const s = nextAlertState(emptyAlertState("w"), { notified: decisions, currentPrice: 169000, currentIsDemo: true, targetPrice: 170000, now: NOW });
    expect(s).toMatchObject({ lastNotifiedPrice: 169000, lastNotifiedIsDemo: true, targetActive: true });
    expect(Object.keys(s.lastByType).sort()).toEqual(["NEW_LOW", "PRICE_DROP", "TARGET_REACHED"]);
  });
});

describe("related deal alerts (Phase 1.5 matching)", () => {
  const related = relatedDeals([deal({ id: "gf1", price: 139000 })], request); // 11/11~11/14, one day earlier
  const w = { targetPrice: undefined, alertPriceDropPercent: 5, alertNewLow: false, registeredPrice: undefined, registeredIsDemo: false };

  it("notifies for a similar-schedule deal cheaper than the current fare", () => {
    const d = evaluateAlerts(input({ watchlist: w, currentPrice: undefined, history: [], relatedDeals: related, previousPrice: undefined }));
    // no current fare and no target → not actionable
    expect(d).toEqual([]);
    const d2 = evaluateAlerts(input({ watchlist: w, currentPrice: 178000, previousPrice: 178000, history: [178000], relatedDeals: related }));
    expect(d2.filter((x) => x.type === "RELATED_DEAL")).toHaveLength(1);
    expect(d2.find((x) => x.type === "RELATED_DEAL")).toMatchObject({ shouldNotify: true, oldPrice: 178000, newPrice: 139000 });
  });
  it("ignores a deal that is not cheaper than the current fare", () => {
    const d = evaluateAlerts(input({ watchlist: w, currentPrice: 130000, history: [130000], relatedDeals: related }));
    expect(d.some((x) => x.type === "RELATED_DEAL")).toBe(false);
  });
  it("notifies a deal once; again only if its price fell by the thresholds", () => {
    const seen = { ...emptyAlertState("w"), notifiedDeals: { gf1: { price: 139000, at: hoursAgo(30) } } };
    const base = { watchlist: w, currentPrice: 178000, history: [178000], relatedDeals: related };
    expect(evaluateAlerts(input({ ...base, state: seen })).some((x) => x.type === "RELATED_DEAL")).toBe(false);
    const cheaper = relatedDeals([deal({ id: "gf1", price: 125000 })], request); // −14,000
    expect(evaluateAlerts(input({ ...base, relatedDeals: cheaper, state: seen })).find((x) => x.type === "RELATED_DEAL")?.shouldNotify).toBe(true);
  });
});

describe("message building", () => {
  const wl = { origin: "ICN", destination: "NRT", departureDate: "2026-11-12", returnDate: "2026-11-15", targetPrice: 170000 };
  const current = { price: 169000, provider: "skyscanner", at: "2026-10-07T09:32:00.000Z", isDemo: false, stale: false, bookingUrl: "https://example.com/book" };
  const names = { skyscanner: "Skyscanner" };

  it("combines all met fare conditions into ONE message in the spec's layout", () => {
    const decisions = evaluateAlerts(input());
    const built = buildAlertMessages(decisions, { watchlist: wl, current, score: dealScore({ current: 169000, target: 170000, priorPrices: [189000] }), names });
    expect(built).toHaveLength(1);
    const m = built[0]!.message;
    expect(m.title).toContain("목표가 도달");
    for (const s of ["서울(ICN) → 도쿄(NRT)", "11/12 ~ 11/15", "현재 최저가", "169,000원", "이전", "189,000원", "20,000원 하락", "목표 가격", "170,000원", "✅ 목표가 도달", "Deal Score", "/100", "Skyscanner", "마지막 확인", "2026-10-07 18:32"]) expect(m.text).toContain(s);
    expect(m).toMatchObject({ url: "https://example.com/book", urlLabel: "항공권 확인하기", isDemo: false });
    expect(built[0]!.decisions.map((d) => d.type).sort()).toEqual(["NEW_LOW", "PRICE_DROP", "TARGET_REACHED"]);
  });
  it("suppressed decisions produce no message", () => {
    const decisions = evaluateAlerts(input()).map((d) => ({ ...d, shouldNotify: false }));
    expect(buildAlertMessages(decisions, { watchlist: wl, current, names })).toEqual([]);
  });
  it("marks DEMO data messages as demo", () => {
    const built = buildAlertMessages(evaluateAlerts(input({ currentIsDemo: true })), { watchlist: wl, current: { ...current, isDemo: true }, names });
    expect(built[0]!.message.isDemo).toBe(true);
  });
  it("related-deal message follows the spec example (one day earlier → saves ~39,000원)", () => {
    const related = relatedDeals([deal({ id: "gf1", price: 139000, provider: "chulguk" })], request);
    const decisions = evaluateAlerts(input({ watchlist: { targetPrice: undefined, alertPriceDropPercent: 5, alertNewLow: false, registeredPrice: undefined, registeredIsDemo: false }, currentPrice: 178000, history: [178000], relatedDeals: related }));
    const built = buildAlertMessages(decisions, { watchlist: wl, current: { ...current, price: 178000 }, names: { chulguk: "출국의 신" } });
    const m = built.find((b) => b.decisions[0]!.type === "RELATED_DEAL")!.message;
    for (const s of ["🔥 비슷한 일정의 특가 발견", "현재 선택 일정", "11/12 ~ 11/15", "특가 일정", "11/11 ~ 11/14", "139,000원~", "일정을 하루 앞당기면", "약 39,000원 절약할 수 있습니다.", "출국의 신"]) expect(m.text).toContain(s);
  });
  it("formats KST timestamps", () => {
    expect(formatKst("2026-10-07T09:32:00Z")).toBe("2026-10-07 18:32");
  });
});
