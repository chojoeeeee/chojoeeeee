import type { NotificationMessage, NotificationProvider, NotificationResult } from "./types";

/** Routes a message to the provider of its channel; a provider failure never throws. */
export class NotificationService {
  private readonly providers = new Map<string, NotificationProvider>();

  constructor(providers: NotificationProvider[]) {
    for (const p of providers) this.providers.set(p.channel, p);
  }

  has(channel: string): boolean {
    return this.providers.has(channel);
  }

  async send(channel: string, message: NotificationMessage): Promise<NotificationResult> {
    const p = this.providers.get(channel);
    if (!p) return { ok: false, dryRun: false, error: `알림 채널 '${channel}'이 설정되지 않았습니다.` };
    try {
      return await p.send(message);
    } catch (e) {
      return { ok: false, dryRun: false, error: e instanceof Error ? e.message.slice(0, 200) : "send failed" };
    }
  }
}
