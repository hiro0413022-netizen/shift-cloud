import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OFFICIAL SITE",
  description: "プロゴルファー オフィシャルサイト",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
