import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "__APP_TITLE__ | YOZAN",
  description: "__DESC__",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
