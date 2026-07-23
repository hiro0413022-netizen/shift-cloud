import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SWING CORTEX — コーチング診断",
  description: "現場のレッスン1件ごとに賢くなる、コーチングの共有脳",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
