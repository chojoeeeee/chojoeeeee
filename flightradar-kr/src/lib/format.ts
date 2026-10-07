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

/** "방금" / "15분 전" / "3시간 전" / "2일 전" */
export function timeAgo(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "아직 없음";
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (24 * 60))}일 전`;
}

/** Start of the current day in Korea time (as an ISO instant). */
export function kstDayStart(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3_600_000).toISOString();
}
