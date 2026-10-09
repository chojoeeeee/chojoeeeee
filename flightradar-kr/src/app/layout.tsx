import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "항공권 특가 레이더",
  description: "여행 날짜만 넣으면 6개 사이트 가격을 한 번에 비교해 드려요.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
            <Link href="/" className="whitespace-nowrap text-base font-extrabold text-brand">✈ 특가 레이더</Link>
            <nav className="flex gap-4 text-sm font-medium text-muted" aria-label="메뉴">
              <Link href="/watchlist">추적 목록</Link>
              <Link href="/settings/notifications">설정</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-xl px-4 pb-28 pt-5">{children}</main>
      </body>
    </html>
  );
}
