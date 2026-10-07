const DAY = 86_400_000;

function parse(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}
function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fmt(parse(date) + days * DAY);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY);
}

export function monthBounds(date: string): { start: string; end: string } {
  const d = new Date(parse(date));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return { start: fmt(Date.UTC(y, m, 1)), end: fmt(Date.UTC(y, m + 1, 0)) };
}
