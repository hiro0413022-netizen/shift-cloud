// AI店長 第1弾: 体験フォロー文面の下書き（DECISIONS #148）
// ルールベースの即時生成（demo-sales #54 と同じ「AIより先に高速生成」方針）。
// server-only に依存しない純関数 = tests/follow-draft.test.ts で検証する。

export type FollowDraftInput = {
  guestName: string | null;      // 空なら「お客様」
  visitedOn: string;             // YYYY-MM-DD
  trialReason: string | null;    // 受付アンケートの体験目的（無ければ汎用文）
  storeName: string;             // 署名に使う
  siteUrl?: string | null;       // FRANKなど公式サイトがある店舗のみ
};

/** 体験目的に合わせたひとこと。アンケートの選択肢（walkin.ts TRIAL_REASONS）に対応 */
export function reasonLine(reason: string | null): string {
  const r = reason ?? "";
  if (/飛距離/.test(r)) return "飛距離アップは、計測データをもとに練習を続けるほど効果が出ます。";
  if (/パーソナル|PGA|習って/.test(r)) return "マンツーマンでじっくり進めるのが、いちばんの上達の近道です。";
  if (/天候|環境|自宅が近い|会社が近い/.test(r)) return "天候や時間を気にせず続けられるのが、インドアのいちばんの強みです。";
  if (/シミュレーション|トラックマン|計測/.test(r)) return "計測データは、回数を重ねるほど練習の質を上げてくれます。";
  return "ゴルフのお悩みは、少しずつでも続けることがいちばんの近道です。";
}

function mdLabel(ymd: string): string {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}月${Number(m[2])}日` : ymd;
}

export function buildFollowDraft(input: FollowDraftInput): { subject: string; body: string } {
  const name = (input.guestName ?? "").trim();
  const subject = `【${input.storeName}】ご体験ありがとうございました`;
  const lines: string[] = [];
  // 氏名が空のときは「お客様」1語（「お客様様」と二重にしない）
  lines.push(name ? `${name}様` : "お客様");
  lines.push("");
  lines.push(`先日（${mdLabel(input.visitedOn)}）は ${input.storeName} の体験にお越しいただき、ありがとうございました。`);
  lines.push(reasonLine(input.trialReason));
  lines.push("その後、ご不明な点やご質問はございませんでしょうか。");
  lines.push("");
  lines.push("打席の空き状況やプランのご相談だけでも、お気軽にご連絡ください。");
  if (input.siteUrl) lines.push(`ご予約・料金のご案内はこちら: ${input.siteUrl}`);
  lines.push("スタッフ一同、またお会いできるのを楽しみにしております。");
  lines.push("");
  lines.push(input.storeName);
  return { subject, body: lines.join("\n") };
}
