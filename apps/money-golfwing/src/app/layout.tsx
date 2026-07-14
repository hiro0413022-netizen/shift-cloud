import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GOLF WING お金管理 — Money OS",
  description: "GOLF WING 現場のお金（売上・現金出納・金種・経費・カード/口座取込）を管理",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
