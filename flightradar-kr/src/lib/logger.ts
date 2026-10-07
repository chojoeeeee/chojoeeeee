export interface ProviderLogEntry {
  provider: string;
  requestedAt: string;
  status: "ok" | "error" | "timeout" | "unavailable";
  elapsedMs: number;
  resultCount: number;
  error?: string;
}

type Sink = (entry: ProviderLogEntry) => void;

let sink: Sink = (e) => {
  // Only structured, non-sensitive fields are logged (no keys, no user data).
  console.info(`[provider] ${e.provider} ${e.status} ${e.elapsedMs}ms results=${e.resultCount}${e.error ? ` error=${e.error}` : ""}`);
};

/** Phase 2 swaps this for a DB writer (`provider_logs`). */
export function setProviderLogSink(s: Sink) {
  sink = s;
}

/** Strip anything that looks like a credential from an error message. */
export function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/(api[-_ ]?key|token|secret|authorization)\s*[=:]\s*\S+/gi, "$1=[redacted]")
    .slice(0, 300);
}

export function logProviderRequest(entry: ProviderLogEntry) {
  sink(entry);
}
