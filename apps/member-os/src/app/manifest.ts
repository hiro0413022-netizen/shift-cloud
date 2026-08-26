import type { MetadataRoute } from "next";

/**
 * ホーム画面に追加できるようにする（#154 / 構想 §3-4）
 *
 * 「来店したらスマホを開く」を狙うなら、ブックマークではなく**アイコン**である必要がある。
 * start_url を /member にしているので、アイコンから開けば会員ポータルがそのまま立ち上がる。
 * scope は "/" のまま（打席QR /bay/... から開いてもアプリ内に留まる）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FRANK GOLF 会員ポータル",
    short_name: "FRANK GOLF",
    description: "会員証・予約・レッスンカルテ・ドリンク注文",
    start_url: "/member",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8f6",
    theme_color: "#14452f",
    lang: "ja",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
