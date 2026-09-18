/**
 * よそのシステムへの入口。
 * 発注管理（apps/golfwing・Vercel shift-cloud-golfwing）は craft-os と別ログイン。
 * 未ログインで開くと /login?next=... に飛び、ログイン後にその発注に戻る。
 */
export const GOLFWING_URL = (process.env.NEXT_PUBLIC_GOLFWING_URL || "https://shift-cloud-golfwing.vercel.app").replace(/\/$/, "");

/** 発注管理の発注1件（オーダー用紙）。プールにある間は、ここで中身を直して送れる */
export const golfwingOrderUrl = (purchaseOrderId: number) => `${GOLFWING_URL}/orders/${purchaseOrderId}`;

/** 発注管理の発注プール（仕入先ごとにまとめて発注する画面） */
export const GOLFWING_POOL_URL = `${GOLFWING_URL}/purchase-pool`;
