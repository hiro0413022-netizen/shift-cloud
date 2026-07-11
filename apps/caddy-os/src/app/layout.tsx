import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caddy OS | YOZAN",
  description: "キャディ派遣の派遣管理・売上/委託料・収支",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
