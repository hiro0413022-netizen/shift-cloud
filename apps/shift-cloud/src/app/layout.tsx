import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN Shift Cloud",
  description: "シフト・勤怠・給与・店舗運営をひとつに。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
