import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIカルテナレッジ — コーチング診断",
  description: "現場のレッスン1件ごとに賢くなる、コーチングの共有脳",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* RaRa LESSON テーマの英字見出し（読めなくても Georgia に落ちる） */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
