import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "항공권 특가 레이더",
  description: "여행 날짜만 넣으면 가장 싼 항공권을 찾아드려요.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
            <Link href="/" className="whitespace-nowrap text-sm font-bold text-brand sm:text-base">✈ 항공권 특가 레이더</Link>
            <nav className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs text-muted sm:gap-x-4 sm:text-sm" aria-label="주요 메뉴">
              <Link href="/watchlist">추적 목록</Link>
              <Link href="/settings/notifications">알림</Link>
              <Link href="/admin/providers">공급처</Link>
              <Link href="/admin/watchlists">관리</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
