import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GOLF WING 予約 — Reserve OS",
  description: "GOLF WING シャフトフィッティングのご予約。ビジターのお客様も公式LINEから簡単にお申し込みいただけます。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
