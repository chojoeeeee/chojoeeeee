/**
 * Notification delivery contract. The Alert Engine decides WHAT to tell; a NotificationProvider
 * only delivers. Add Email / Web Push / Kakao by implementing this interface.
 */
export interface NotificationMessage {
  /** Short title, also the first line of the text. */
  title: string;
  /** Plain text body (providers escape/format it for their channel). */
  text: string;
  /** Optional call-to-action link. */
  url?: string;
  urlLabel?: string;
  /** True when built from DEMO DATA — must be visibly marked. */
  isDemo: boolean;
}

export interface NotificationResult {
  ok: boolean;
  /** True when nothing was actually sent (TELEGRAM_DRY_RUN). */
  dryRun: boolean;
  error?: string;
}

export interface NotificationProvider {
  readonly channel: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
}
