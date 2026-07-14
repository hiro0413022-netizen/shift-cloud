import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOZAN アンケート — Survey OS",
  description: "GOLF WING アンケート/情報収集システム — 作成・回答・集計・CSV出力",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
