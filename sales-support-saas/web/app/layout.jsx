import "./globals.css";

export const metadata = {
  title: "Sales OS — 営業サポート",
  description: "営業マンが今日やることが一目でわかるシステム",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
