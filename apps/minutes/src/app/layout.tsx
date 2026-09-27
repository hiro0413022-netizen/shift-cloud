import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "議事録 | YOZAN",
  description: "会議の録音から文字起こし・場面別の要約",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
