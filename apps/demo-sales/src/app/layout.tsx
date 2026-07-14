import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI DEMO SALES | YOZAN",
  description: "クリニック・動物病院向けHP制作の営業デモ高速生成",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
