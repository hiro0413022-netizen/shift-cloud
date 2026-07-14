// categorize.ts — 取込明細の科目提案（非サーバーアクション。UIとactions双方から利用）

export type ImportResult = { ok: number; skipped: number; errors: string[]; source?: string };

/**
 * 摘要から科目(fin_categories.code)を推測（経理AIに置換予定の暫定ルール）。
 * AMEXの英字/漢字と、尼崎信金の半角カナ摘要の両方に対応。
 */
export function proposeCategory(desc: string): string {
  const d = (desc ?? "").toLowerCase();
  const has = (...ks: string[]) => ks.some((k) => desc.includes(k) || d.includes(k.toLowerCase()));

  // 水道光熱費
  if (has("ENEOS", "エネオス", "出光", "イデミツ", "アポロ", "電気", "ガス", "水道", "ﾃﾞﾝﾘｮｸ", "ｶﾝｻｲﾃﾞﾝ", "ｵｵｻｶｶﾞｽ", "ｽｲﾄﾞｳ")) return "utility";
  // 広告宣伝費
  if (has("google", "meta", "facebook", "広告", "ADS", "ｺｳｺｸ")) return "ad";
  // 地代家賃・リース
  if (has("家賃", "賃料", "ﾔﾁﾝ", "ﾁﾝﾀｲ", "ﾘｰｽ", "ﾘ-ｽ")) return "rent";
  // 消耗品・備品
  if (has("コーナン", "ダイソー", "セブン", "ローソン", "ファミリーマート", "ミニストップ", "文具", "キリン堂", "ｺｰﾅﾝ")) return "supplies";
  // 外注費（SaaS・税理士・専門家）
  if (has("GENSPARK", "MESHY", "SLACK", "Apple", "iTunes", "お名前", "レンタルサ", "ドメイン", "トランビ", "Vercel", "Anthropic", "OpenAI", "ADOBE", "税理士", "ｾﾞｲﾘｼ", "ｶｲｹｲｼ")) return "outsourcing";
  // 税金・社会保険・手数料・保険 → その他経費（租税公課/法定福利/支払手数料/保険料）
  if (has("ﾃｽｳﾘﾖｳ", "手数料", "ｺｸｾﾞｲ", "ﾁﾎｳｾﾞｲ", "ｾﾞｲﾑｼﾖ", "ｼﾔｶｲﾎｹﾝ", "ﾈﾝｷﾝ", "ｿﾝﾎﾟ", "ｾｲﾒｲ", "AIG", "ﾎｹﾝ", "税")) return "other_expense";
  // 個人宛の振込（法人マーカーが無い）→ 給与・報酬 = 人件費
  if (has("IBﾌﾘｺﾐ", "振込", "ﾌﾘｺﾐ") && !has("ｷﾖｳｶｲ", "ｸﾗﾌﾞ", "ｶ)", "ｼﾔ)", "(ｼﾔ", "ｶﾌﾞｼｷ", "ｺｳﾎﾞｳ", "ｶﾞｲｼﾔ", "株式会社", "有限会社")) return "labor";
  // 法人宛の振込 → 外注/仕入先
  if (has("IBﾌﾘｺﾐ", "振込", "ﾌﾘｺﾐ")) return "outsourcing";

  if (has("郵便", "クロネコ", "ヤマト", "送料")) return "other_expense";
  return "other_expense";
}

/** カード引落など「経費でない振替（二重計上になる）」を検出。取込時にignoreの初期値に使う。 */
export function isCardSettlement(desc: string): boolean {
  return /ｱﾒﾘｶﾝ ?ｴｷｽﾌﾟﾚｽ|AMERICAN ?EXPRESS|ｶｰﾄﾞ ?ﾋｷｵﾄｼ/i.test(desc ?? "");
}
