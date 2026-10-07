import type { NotificationMessage, NotificationProvider, NotificationResult } from "./types";

export interface TelegramConfig {
  token?: string;
  chatId?: string;
  /** TELEGRAM_DRY_RUN=true: log the message instead of sending it. Tests always use this. */
  dryRun: boolean;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Telegram-HTML body for a message. DEMO messages are explicitly marked. */
export function formatTelegramText(m: NotificationMessage): string {
  const demo = m.isDemo ? "🧪 <b>DEMO DATA — 실제 가격이 아닌 테스트 알림</b>\n\n" : "";
  return `${demo}${escapeHtml(m.text)}`;
}

/** Removes the bot token (which appears in API URLs) from anything that might be logged. */
export function redactToken(s: string, token?: string): string {
  let out = s.replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]");
  if (token) out = out.split(token).join("[redacted]");
  return out;
}

export class TelegramNotificationProvider implements NotificationProvider {
  readonly channel = "telegram";

  constructor(private readonly cfg: TelegramConfig) {}

  /** True when real delivery is possible. */
  isConfigured(): boolean {
    return Boolean(this.cfg.token && this.cfg.chatId);
  }

  async send(message: NotificationMessage): Promise<NotificationResult> {
    const text = formatTelegramText(message);
    if (this.cfg.dryRun) {
      (this.cfg.log ?? ((l) => console.info(l)))(`[telegram:dry-run] ${text}${message.url ? `\n→ ${message.url}` : ""}`);
      return { ok: true, dryRun: true };
    }
    if (!this.isConfigured()) return { ok: false, dryRun: false, error: "Telegram이 설정되지 않았습니다 (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID)." };

    // The CTA button only for real, https links — never for DEMO placeholders.
    const button = message.url && !message.isDemo && /^https:\/\//.test(message.url) ? { inline_keyboard: [[{ text: message.urlLabel ?? "항공권 확인하기", url: message.url }]] } : undefined;
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(`https://api.telegram.org/bot${this.cfg.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.cfg.chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: button }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, dryRun: false, error: `Telegram HTTP ${res.status}` };
      return { ok: true, dryRun: false };
    } catch (e) {
      return { ok: false, dryRun: false, error: redactToken(e instanceof Error ? e.message : String(e), this.cfg.token).slice(0, 200) };
    }
  }
}
