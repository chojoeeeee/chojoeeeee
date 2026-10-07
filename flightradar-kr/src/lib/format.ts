export function formatKrw(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** Wall-clock HH:mm of an ISO string *in the offset it was written with*. */
export function formatClock(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : iso;
}

export function formatMonthDay(date: string): string {
  const [, mm, dd] = date.split("-");
  return `${Number(mm)}.${Number(dd)}`;
}

export function minutesSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}

/** "HH:mm" in Korea time for an ISO timestamp. */
export function formatKstClock(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));
}
