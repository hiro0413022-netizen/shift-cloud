import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN GENESIS",
  description: "会社を動かすOS — YOZAN Genesis Cockpit",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
