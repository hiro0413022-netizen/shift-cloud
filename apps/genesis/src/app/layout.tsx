import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN GENESIS",
  description: "会社を動かすOS — YOZAN Genesis Cockpit",
};

/**
 * PC/スマホの自動切替の土台。
 * width=device-width で端末の実幅を使う（これが無いとスマホが980px幅の縮小表示になり、
 * md: のブレークポイントが効かず「PC画面が小さく映るだけ」になる）。
 * maximumScale は指定しない＝ピンチ拡大を許可（見えないときに指で拡大できる）。
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body>{children}</body>
    </html>
  );
}
