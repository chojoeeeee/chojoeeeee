import "server-only";

/** Server-side env access. Never import this from a Client Component. */
export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function envInt(name: string, fallback: number): number {
  const n = Number(env(name));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
