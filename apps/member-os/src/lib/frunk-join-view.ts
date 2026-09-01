/**
 * 入会申込（承認待ち）の「決済がどこまで進んでいるか」の見せ方（#188・純関数）
 *
 * 画面に出したい判断は1つだけ:「この人は払ったのか、まだなのか」。
 * DBの billing_status はその**手がかり**であって答えではない（Webhookが落ちれば checkout のまま残る）。
 * なので言い切らず、「Squareで確認できます」まで案内する文言にしてある。
 * 確定的な答えは Square に聞きに行く（checkJoinPayment）。
 */

export type JoinPaymentTone = "ok" | "warn" | "info";

export type JoinPaymentView = {
  tone: JoinPaymentTone;
  label: string;
  /** 承認ボタンの手前に出す説明（空なら出さない） */
  note: string;
  /** 請求予定額（税込・円）。0＝決済リンク未発行 */
  expected: number;
  /** Squareへの照会ボタンを出すか */
  canCheck: boolean;
};

export function joinPaymentView(m: {
  billing_status?: unknown;
  square_checkout_breakdown?: unknown;
  payment_method?: unknown;
}): JoinPaymentView {
  const bs = String(m.billing_status ?? "");
  const bd = (m.square_checkout_breakdown ?? null) as { total?: number } | null;
  const expected = Number(bd?.total ?? 0);

  if (bs === "active") {
    return {
      tone: "ok",
      label: "入金 確認済み",
      note: "",
      expected,
      canCheck: true,
    };
  }
  if (bs === "checkout") {
    return {
      tone: "warn",
      label: "決済ページまで進んだが入金は未確認",
      note:
        expected > 0
          ? `Web入会は入金の受信で自動的に会員番号が出ます。まだ出ていない＝「未入金」か「入金の通知が届かなかった」のどちらかです。先に「Squareで入金を確認」を押してください（請求予定額 ${expected.toLocaleString()}円・税込）。`
          : "Web入会は入金の受信で自動的に会員番号が出ます。まだ出ていない＝「未入金」か「入金の通知が届かなかった」のどちらかです。先に「Squareで入金を確認」を押してください。",
      expected,
      canCheck: true,
    };
  }
  // 決済リンクを一度も出していない＝店頭入会（現金・振込・口座振替）の申込
  return {
    tone: "info",
    label: "Web決済なし（店頭でのお手続き）",
    note: "この申込はWeb決済を使っていません。店頭でのお支払い（現金・振込・口座振替）を確認してから承認してください。",
    expected,
    canCheck: true,
  };
}
