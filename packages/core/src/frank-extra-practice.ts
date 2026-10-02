/**
 * 追加練習チケット（55分 2,750円税込・#332・2026-10-02 ユーザー依頼）
 *
 * ★ どういう制度か（ユーザーの言葉）
 *   「通常の予約枠を利用した後、次の時間に空きがあれば、チケットを購入して追加で練習できる」
 *   ・1枠55分／2,750円（税込）
 *   ・購入は原則、当日店舗にて受付
 *   ・利用終了時に次の枠の空きを確認し、購入・利用する
 *   ・追加回数の上限は設けず、1枠ごとに空きを確認する
 *   ・事前予約や、複数枠の取り置きは不可
 *
 * ★ 「チケット」だが台帳は持たない
 *   買うのと使うのが同時（その場の追加練習に使う）なので、残枚数という概念が無い。
 *   残高0の台帳を作ると「持っているのに使えない」という問い合わせの元になるだけ。
 *   代わりに **予約そのもの**（frunk_bookings.customer_kind='extra'）を記録とする。
 *   打席を押さえないと練習できないので、予約は必ず立つ＝数え漏れが起きない。
 *
 * ★ 月会費の上限には数えない（ユーザー決定）
 *   別料金の追加利用なので、プランの「1日の上限」「消化してから次を取る」には含めない。
 *   含めると、レギュラー会員は通常の1時間を使った時点で追加が買えなくなる。
 *   除外は apps/genesis/src/lib/frank-booking.ts の3か所（1日の上限・同時保有枠・ライトの月4回）。
 *
 * ★ 事前予約は不可＝お客様の画面からは取れない。スタッフが店頭で入れる道だけを作る。
 */

/** frunk_bookings.customer_kind の値 */
export const EXTRA_PRACTICE_KIND = "extra";

/** 1枠の長さ（分）。60分枠の中に収める＝毎時00分スタートの並びを崩さない */
export const EXTRA_PRACTICE_MINUTES = 55;

/** 1枠の料金（税込） */
export const EXTRA_PRACTICE_PRICE = 2750;

export const EXTRA_PRACTICE_LABEL = "追加練習";

/**
 * レギュラー→マスターの月会費の差額（税込）。
 * レギュラー 15,180円 / マスター 21,780円＝6,600円（2026-10-02 ユーザー提示と一致）。
 */
export const MASTER_UPGRADE_DIFF = 6600;

/** 追加練習◯枠ぶんの金額（税込） */
export function extraPracticeTotal(count: number): number {
  const n = Math.max(0, Math.trunc(Number(count) || 0));
  return n * EXTRA_PRACTICE_PRICE;
}

/**
 * マスター会員への変更をご案内すべきか（ユーザーの意図）
 *   「頻繁に追加利用される方には、マスター会員への変更もご案内できると思います」
 *   月2枠＝5,500円（差額6,600円より安い＝そのままでよい）
 *   月3枠＝8,250円（差額を超える＝マスターのほうが安い）
 * 境目を金額で決める＝料金改定で枠数がずれても勝手に追従する。
 */
export function suggestMasterUpgrade(countThisMonth: number): boolean {
  return extraPracticeTotal(countThisMonth) > MASTER_UPGRADE_DIFF;
}

/** スタッフ画面に出す一言。言い切らず、ご案内の材料として出す */
export function extraPracticeAdvice(countThisMonth: number, planName?: string | null): string {
  const n = Math.max(0, Math.trunc(Number(countThisMonth) || 0));
  if (n === 0) return "";
  const yen = (v: number) => v.toLocaleString("ja-JP");
  const spent = extraPracticeTotal(n);
  if (String(planName ?? "").includes("マスター")) {
    return `今月 ${n}枠（${yen(spent)}円）ご利用です。`;
  }
  if (suggestMasterUpgrade(n)) {
    return `今月 ${n}枠（${yen(spent)}円）ご利用です。マスター会員への変更なら月会費の差額 ${yen(MASTER_UPGRADE_DIFF)}円で毎日2コマお使いいただけます（ご案内の目安）。`;
  }
  return `今月 ${n}枠（${yen(spent)}円）ご利用です。`;
}

/**
 * "HH:MM" / "HH:MM:SS" を時分に。形が違えば null。
 * ⚠ Number("") は 0 で、しかも Number.isFinite(0) は true。
 *   空文字を弾くつもりで Number().isFinite だけ見ると 0時0分として通ってしまい、
 *   空欄のまま「00:55」という予約ができる（テストで発見・2026-10-02）。
 */
function parseHm(hm: string): { h: number; m: number } | null {
  const s = String(hm ?? "").trim();
  const mt = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!mt) return null;
  const h = Number(mt[1]);
  const m = Number(mt[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * 次の枠の開始時刻。
 * 追加練習は「利用終了時に次の枠の空きを確認して」入れるものなので、
 * 直前の予約の終了時刻ではなく **その次の正時** を既定にする
 * （55分予約は 10:00〜10:55 のように終わるので、終了時刻をそのまま使うと 10:55 開始になる）。
 */
export function nextHourStart(hm: string): string {
  const t = parseHm(hm);
  if (!t) return "";
  const nextH = t.m === 0 ? t.h : t.h + 1;
  if (nextH > 23) return "";
  return `${String(nextH).padStart(2, "0")}:00`;
}

/** 終了時刻（開始＋55分）。"HH:MM"。日をまたぐ・形が違うときは空文字 */
export function extraPracticeEnd(startHm: string): string {
  const t = parseHm(startHm);
  if (!t) return "";
  const total = t.h * 60 + t.m + EXTRA_PRACTICE_MINUTES;
  if (total >= 24 * 60) return "";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
