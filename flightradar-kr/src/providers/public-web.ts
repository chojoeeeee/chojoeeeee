import { isPathAllowed } from "./robots";
import { ProviderUnavailableError } from "./types";

export const BOT_USER_AGENT = "FlightRadarKR/0.1 (personal price tracker; contact: owner)";

export interface PublicFetchOptions {
  provider: string;
  url: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Responses are reused for this long, so a page is never hit more often than needed. */
  cacheTtlMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const pageCache = new Map<string, { at: number; html: string }>();
export function clearPublicFetchCache() {
  pageCache.clear();
}

/**
 * Fetches ONE public page politely: honours robots.txt for our user agent,
 * identifies itself, caches, limits size. It never logs in, solves CAPTCHAs
 * or evades protections — a blocked/failed robots check stops the collection.
 *
 * Callers must additionally gate this behind explicit, recorded approval
 * (terms checked) — see each provider's schedulePolicy().
 */
export async function fetchPublicHtml(opts: PublicFetchOptions): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const hit = pageCache.get(opts.url);
  if (hit && now() - hit.at < (opts.cacheTtlMs ?? 30 * 60_000)) return hit.html;

  const target = new URL(opts.url);
  const init = (accept: string): RequestInit => ({
    headers: { "user-agent": BOT_USER_AGENT, accept },
    signal: opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 8000),
    cache: "no-store",
  });

  let robots = "";
  try {
    const res = await f(`${target.origin}/robots.txt`, init("text/plain"));
    if (res.ok) robots = await res.text();
    else if (res.status >= 500) throw new Error(`robots ${res.status}`);
    // 4xx → no robots file → no restrictions (RFC 9309)
  } catch {
    throw new ProviderUnavailableError(opts.provider, "unavailable", "robots.txt를 확인하지 못해 수집을 중단했습니다.");
  }
  if (!isPathAllowed(robots, target.pathname + target.search, BOT_USER_AGENT)) {
    throw new ProviderUnavailableError(opts.provider, "manual_check", "robots.txt가 이 경로의 자동 수집을 허용하지 않아 수집하지 않습니다.");
  }

  const res = await f(opts.url, init("text/html"));
  if (!res.ok) throw new Error(`${opts.provider} HTTP ${res.status}`);
  const html = await res.text();
  if (html.length > (opts.maxBytes ?? 2_000_000)) throw new Error(`${opts.provider} page too large`);
  pageCache.set(opts.url, { at: now(), html });
  return html;
}
