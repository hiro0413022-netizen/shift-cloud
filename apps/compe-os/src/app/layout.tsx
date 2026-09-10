import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compe OS | YOZAN",
  description: "ゴルフコンペの受付・組み合わせ・スコア・表彰",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
