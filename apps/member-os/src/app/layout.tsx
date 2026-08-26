import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN 体験受付 — Member OS",
  description: "体験受付・会員管理システム — 予約・来店・入会をここで管理",
  // ホーム画面に追加したときの見え方（#154）。iOSは manifest の icons を見ないので apple 側も要る
  appleWebApp: { capable: true, title: "FRANK GOLF", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#14452f",
  // 会員証QRとメニューはスマホで見る。拡大は許可したままにする（読み取り機側で調整できないため）
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
