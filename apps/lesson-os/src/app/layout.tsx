import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GOLF WING Lesson OS — レッスンカルテ",
  description: "スイング動画・コーチコメント・上達記録をひとつのカルテに",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
