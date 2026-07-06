import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN 体験受付 — Member OS",
  description: "GOLF WING 体験受付システム — 予約・来店・入会をここで管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
