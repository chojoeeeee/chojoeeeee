import { describe, expect, it, vi } from "vitest";
import { NotificationService } from "@/lib/notifications/service";
import { TelegramNotificationProvider, formatTelegramText, redactToken } from "@/lib/notifications/telegram";
import type { NotificationMessage } from "@/lib/notifications/types";

const msg: NotificationMessage = { title: "t", text: "🔥 가격 <하락> & 확인", url: "https://example.com/book", urlLabel: "항공권 확인하기", isDemo: false };

describe("Telegram provider", () => {
  it("DRY RUN logs the message and never touches the network (even without credentials)", async () => {
    const fetchSpy = vi.fn();
    const lines: string[] = [];
    const t = new TelegramNotificationProvider({ dryRun: true, fetchImpl: fetchSpy as unknown as typeof fetch, log: (l) => lines.push(l) });
    const res = await t.send(msg);
    expect(res).toEqual({ ok: true, dryRun: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(lines.join("")).toContain("[telegram:dry-run]");
    expect(lines.join("")).toContain("가격 &lt;하락&gt; &amp; 확인");
  });
  it("reports 'not configured' instead of throwing when token / chat id are missing", async () => {
    const res = await new TelegramNotificationProvider({ dryRun: false, token: "t" }).send(msg);
    expect(res.ok).toBe(false);
    expect(res.error).toContain("TELEGRAM_BOT_TOKEN");
  });
  it("sends via the Bot API with an inline link button for real https links", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response("{}", { status: 200 });
    });
    const res = await new TelegramNotificationProvider({ dryRun: false, token: "123:ABC", chatId: "42", fetchImpl: f as unknown as typeof fetch }).send(msg);
    expect(res).toEqual({ ok: true, dryRun: false });
    expect(calls[0]!.url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
    expect(calls[0]!.body).toMatchObject({ chat_id: "42", parse_mode: "HTML" });
    expect(JSON.stringify(calls[0]!.body.reply_markup)).toContain("https://example.com/book");
  });
  it("no link button for DEMO messages; DEMO text is explicitly marked", async () => {
    const calls: Record<string, unknown>[] = [];
    const f = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => (calls.push(JSON.parse(String(init?.body))), new Response("{}", { status: 200 })));
    await new TelegramNotificationProvider({ dryRun: false, token: "1:a", chatId: "1", fetchImpl: f as unknown as typeof fetch }).send({ ...msg, isDemo: true });
    expect(calls[0]!.reply_markup).toBeUndefined();
    expect(String(calls[0]!.text)).toContain("DEMO DATA");
    expect(formatTelegramText({ ...msg, isDemo: true })).toContain("테스트 알림");
  });
  it("API errors become a failed result and never leak the bot token", async () => {
    const bad = vi.fn(async () => new Response("{}", { status: 401 }));
    const r1 = await new TelegramNotificationProvider({ dryRun: false, token: "123:SECRET", chatId: "1", fetchImpl: bad as unknown as typeof fetch }).send(msg);
    expect(r1).toMatchObject({ ok: false, error: "Telegram HTTP 401" });
    const boom = vi.fn(async () => {
      throw new Error("request to https://api.telegram.org/bot123:SECRET/sendMessage failed");
    });
    const r2 = await new TelegramNotificationProvider({ dryRun: false, token: "123:SECRET", chatId: "1", fetchImpl: boom as unknown as typeof fetch }).send(msg);
    expect(r2.ok).toBe(false);
    expect(r2.error).not.toContain("SECRET");
    expect(redactToken("bot999:abc-DEF_1 x", undefined)).toBe("bot[redacted] x");
  });
});

describe("NotificationService", () => {
  it("routes by channel, reports unknown channels, and never throws", async () => {
    const svc = new NotificationService([{ channel: "telegram", send: async () => ({ ok: true, dryRun: false }) }, { channel: "boom", send: async () => { throw new Error("x"); } }]);
    expect(await svc.send("telegram", msg)).toMatchObject({ ok: true });
    expect((await svc.send("email", msg)).ok).toBe(false);
    expect((await svc.send("boom", msg)).ok).toBe(false);
    expect(svc.has("telegram")).toBe(true);
    expect(svc.has("email")).toBe(false);
  });
});
