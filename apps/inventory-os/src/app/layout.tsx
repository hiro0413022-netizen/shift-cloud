import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN Inventory OS — 在庫・棚卸",
  description: "物販在庫の棚卸と入出庫管理。GOLF WING / FRANK GOLF。",
};

// iPadでの棚卸が主用途。ピンチズームは許可（老眼・細かい品名対策）しつつ初期倍率は等倍
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
