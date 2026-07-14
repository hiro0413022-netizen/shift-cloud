import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN Legal OS — 契約・法務管理",
  description: "契約書・覚書・規約・NDAの保管と期限管理。YOZANグループ法務。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
