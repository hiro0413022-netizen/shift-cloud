import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Craft OS | YOZAN",
  description: "フィッティング・見積・注文書・工房の組立指示",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
