function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function offsetSuffix(offsetMin: number): string {
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Local wall-clock date + "HH:mm" in a fixed offset → epoch ms. */
export function localToEpoch(date: string, hhmm: string, offsetMin: number): number {
  return Date.parse(`${date}T${hhmm}:00${offsetSuffix(offsetMin)}`);
}

/** Epoch ms → ISO-8601 string written in the given fixed offset. */
export function epochToIso(ms: number, offsetMin: number): string {
  const shifted = new Date(ms + offsetMin * 60000);
  const y = shifted.getUTCFullYear();
  const mo = pad(shifted.getUTCMonth() + 1);
  const d = pad(shifted.getUTCDate());
  const h = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  return `${y}-${mo}-${d}T${h}:${mi}:00${offsetSuffix(offsetMin)}`;
}

export function diffMinutes(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000);
}
