/** "257,900원" / "₩257,900" / 257900 → 257900 ; unparseable or non-positive → undefined. */
export function parseKrw(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** "-45.0%" / "45%" / 45 → 0.45 (fraction below the reference price). 0 < result < 1 or undefined. */
export function parseDiscountFraction(v: string | number | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Math.abs(typeof v === "number" ? v : Number(v.replace(/[^0-9.\-]/g, "")));
  return Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 10) / 1000 : undefined;
}
