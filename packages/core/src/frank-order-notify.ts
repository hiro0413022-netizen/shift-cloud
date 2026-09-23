/**
 * ドリンク注文が入ったときのLINE文面（#273・2026-09-24 ユーザー依頼）
 *
 * ★ 狙い
 *   電子伝票の音（#189）はiPadの前にいないと気づけない。打席やラウンジで接客していると
 *   鳴っていることすら分からないので、その時間シフトに入っている人のLINEへ直接飛ばす。
 *
 * ★ 文面の順番は「どこへ・何を」
 *   スマホの通知はだいたい1〜2行しか見えない。打席名を先頭に置く＝通知を開かなくても動ける。
 *
 * ★ お客様のお名前は出さない
 *   スタッフ個人のLINEに顧客名が残り続けるのは筋が悪い。打席と会員/ビジターの別で足りる。
 */

export type OrderNotifyLine = { name: string; qty: number };

export type OrderNotifyInput = {
  /** 伝票番号（例 "0924-03"） */
  orderNo: string;
  /** 打席名。null＝打席の指定なし（ラウンジ等） */
  bayName?: string | null;
  /** 会員の注文か（お名前は出さない） */
  isMember: boolean;
  lines: OrderNotifyLine[];
  /** 税込合計 */
  total: number;
  /**
   * お会計のしかた。通知は決済の前に投げる（カードが通らなくても注文は伝える）ので、
   * 「決済済み」とは書かない＝あとで失敗したときに文面が嘘になる。
   *   oncard   = 保存カードに自動決済（会員）
   *   register = 退店時にレジでお会計（ビジター・カード未保存）
   */
  settlement: "oncard" | "register";
  /** 伝票画面のURL（あれば末尾に付ける） */
  ordersUrl?: string | null;
};

export function orderNotifyText(input: OrderNotifyInput): string {
  const where = (input.bayName ?? "").trim() || "打席の指定なし";
  const items = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => `・${l.name} ×${l.qty}`)
    .join("\n");
  const money = `¥${Math.round(input.total).toLocaleString("ja-JP")}`;
  const pay = input.settlement === "oncard" ? "カードに自動決済" : "退店時にレジ";
  const lines = [
    `🥤 ドリンクのご注文（${where}）`,
    items || "・（品目なし）",
    `${money}／${pay}／${input.isMember ? "会員" : "ビジター"}`,
    `伝票 ${input.orderNo}`,
  ];
  const url = (input.ordersUrl ?? "").trim();
  if (url) lines.push(url);
  return lines.join("\n");
}
