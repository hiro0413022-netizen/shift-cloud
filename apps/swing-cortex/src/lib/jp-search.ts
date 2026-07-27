/**
 * 日本語あいまい検索ユーティリティ（依存なし・純関数 / サーバー・クライアント両用）
 *
 * 目的: コーチが「見たまま」入力しても症状に届くこと。
 *   例) 伸びあがり / 伸びあがる / 伸び上がる / のびあがり / 起き上がる
 *       ひっかけ / 引っかけ / 引っ掛け、ねこぜ / 猫背、とばない / 飛ばない
 *
 * 方式（形態素解析なし・辞書レス）:
 *   1) 正規化 …… NFKC → カタカナ→ひらがな → 頻出漢字を読みへ寄せる → 記号/長音/小書き吸収
 *   2) 語幹化 …… 活用語尾（る/り/った/ている/ます 等）を落とす
 *   3) 2-gram の重なり率（overlap coefficient）でスコア化
 * 1文字違い・送り仮名違い・活用違い・漢字/かな違いを、これで横断的に吸収する。
 */

/** カタカナ → ひらがな */
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/**
 * 頻出語の「読み寄せ」表。漢字表記とかな入力を同じ形に落とすためのもの。
 * クエリ側・辞書側の両方に同じ変換をかけるので、誤爆は同音語に限られる。
 * 長いキーから順に適用する（下で長さ降順にソート）。
 */
const READINGS: Record<string, string> = {
  // スイング動作
  伸び上が: "のびあが",
  伸びあが: "のびあが",
  起き上が: "おきあが",
  起きあが: "おきあが",
  突っ込: "つっこ",
  突込: "つっこ",
  引っか: "ひっか",
  引っ掛: "ひっか",
  引掛: "ひっか",
  体重移動: "たいじゅういどう",
  下半身: "かはんしん",
  上半身: "じょうはんしん",
  三角形: "さんかくけい",
  軸回転: "じくかいてん",
  早解け: "はやほどけ",
  早ほどけ: "はやほどけ",
  振り抜: "ふりぬ",
  振抜: "ふりぬ",
  切り返: "きりかえ",
  切返: "きりかえ",
  手打ち: "てうち",
  手元: "てもと",
  手先: "てさき",
  小手先: "こてさき",
  同調: "どうちょう",
  分離: "ぶんり",
  捻転: "ねんてん",
  前傾: "ぜんけい",
  姿勢: "しせい",
  猫背: "ねこぜ",
  重心: "じゅうしん",
  股関節: "こかんせつ",
  地面反力: "じめんはんりょく",
  可動域: "かどういき",
  柔軟: "じゅうなん",
  距離感: "きょりかん",
  飛距離: "ひきょり",
  距離: "きょり",
  方向性: "ほうこうせい",
  方向: "ほうこう",
  安定: "あんてい",
  不足: "ふそく",
  不良: "ふりょう",
  番手: "ばんて",
  傾斜: "けいしゃ",
  打点: "だてん",
  力み: "りきみ",
  力む: "りきむ",
  緊張: "きんちょう",
  集中: "しゅうちゅう",
  疲れ: "つかれ",
  痛み: "いたみ",
  // 部位・単漢字（長いキーの後に適用）
  股関: "こかん",
  頭: "あたま",
  腕: "うで",
  肩: "かた",
  腰: "こし",
  膝: "ひざ",
  足: "あし",
  手: "て",
  体: "からだ",
  軸: "じく",
  芯: "しん",
  砂: "すな",
  球: "たま",
  // 動詞・形容詞の語幹
  曲が: "まが",
  曲げ: "まげ",
  飛ば: "とば",
  握: "にぎ",
  構え: "かまえ",
  開: "ひら",
  閉: "とじ",
  被: "かぶ",
  寝: "ね",
  浮: "う",
  緩: "ゆる",
  崩: "くず",
  止ま: "とま",
  動: "うご",
  使: "つか",
  回: "まわ",
  上げ: "あげ",
  下げ: "さげ",
  叩: "たた",
  当た: "あた",
  乗: "の",
  踏: "ふ",
  泳: "およ",
  薄: "うす",
  高: "たか",
  低: "ひく",
  速: "はや",
  遅: "おそ",
  硬: "かた",
  浅: "あさ",
  深: "ふか",
  広: "ひろ",
  狭: "せま",
  大: "おお",
  小: "ちい",
  左: "ひだり",
  右: "みぎ",
  中央: "ちゅうおう",
  地面: "じめん",
  目標: "もくひょう",
  苦手: "にがて",
  感じ: "かんじ",
  気味: "ぎみ",
};

const READING_KEYS = Object.keys(READINGS).sort((a, b) => b.length - a.length);

/** 小書き仮名 → 通常仮名（ゃゅょ等のゆれを吸収） */
const SMALL: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お",
  ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ", ゕ: "か", ゖ: "け",
};

/**
 * 検索用の正規化形へ。
 * 「伸び上がり」「伸びあがり」「ノビアガリ」→ すべて「のびあかり」相当に寄る。
 */
export function normalize(input: string): string {
  let s = (input ?? "").normalize("NFKC").toLowerCase();
  s = toHiragana(s);
  for (const k of READING_KEYS) {
    if (s.includes(k)) s = s.split(k).join(READINGS[k]);
  }
  s = s.replace(/[ぁぃぅぇぉゃゅょゎゕゖ]/g, (c) => SMALL[c] ?? c);
  // 長音「ー」は残す（消すと「コース」→「こす」で「こすり」等と誤衝突するため）
  s = s.replace(/[〜~－–—]/g, "ー");
  s = s.replace(/[\s、。・,.\/／\\|｜（）()「」『』【】\[\]{}"'`:：;；!！?？*＊+＋=＝%％#＄$&＆@＿_-]/g, "");
  s = s.replace(/[っ]/g, ""); // 促音（突っ込み/突込み）
  return s;
}

/** 活用語尾を落として語幹に寄せる（のびあがり / のびあがる → のびあが） */
const TAIL =
  /(?:させられる|させられ|られる|させる|られ|せる|れる|ている|てます|ています|てる|でいる|でる|ました|ませんでした|ません|まして|ます|しまう|ちゃう|じゃう|たがる|たい|ない|なく|なる|なり|する|した|して|すぎる|すぎ|やすい|にくい|そう|みたい|かんじ|ぎみ|ぐせ|くせ|から|ので|けど|とか|かも)$/;

const TAIL_CHARS = /[るりったてくきいうすしらればろんなだでにをはがもの]$/;

export function stem(normalized: string): string {
  let s = normalized;
  for (let i = 0; i < 2; i++) {
    const next = s.replace(TAIL, "");
    if (next === s || next.length < 2) break;
    s = next;
  }
  if (s.length >= 3) {
    const next = s.replace(TAIL_CHARS, "");
    if (next.length >= 2) s = next;
  }
  return s;
}

/** 2-gram 集合（1文字語はその文字自身） */
function bigrams(s: string): string[] {
  if (s.length <= 1) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return [...new Set(out)];
}

/** 2-gram の重なり率（短い方を分母にする＝長文クエリでも埋もれない） */
function overlap(a: string, b: string): { ratio: number; shared: number } {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return { ratio: 0, shared: 0 };
  const setB = new Set(B);
  let shared = 0;
  for (const g of A) if (setB.has(g)) shared++;
  return { ratio: shared / Math.min(A.length, B.length), shared };
}

/**
 * クエリと語の近さ（0〜1）。
 * 完全含有=1 → 語幹一致=0.9 → 2-gram重なり=0〜0.85。
 * しきい値未満は0（＝無関係を拾わない）。
 */
export function similarity(query: string, term: string): number {
  const q = normalize(query);
  const t = normalize(term);
  if (!q || !t) return 0;

  if (t.length >= 2 && q.includes(t)) return 1;
  if (q.length >= 2 && t.includes(q)) return 0.95;
  if (q.length === 1 || t.length === 1) return q.includes(t) || t.includes(q) ? 0.8 : 0;

  // 語幹一致。ただし短い語幹が長い語の一部にたまたま含まれるだけ（例「はや」⊂「はやほどけ」）は
  // 弱い証拠なので、語幹が3文字以上か、相手の6割以上を占めるときだけ採用する。
  const solid = (part: string, whole: string) => part.length >= 3 || part.length / whole.length >= 0.6;
  const qs = stem(q);
  const ts = stem(t);
  if (ts.length >= 2) {
    if (qs.includes(ts) && solid(ts, qs)) return 0.9;
    if (q.includes(ts) && solid(ts, q)) return 0.9;
  }
  if (qs.length >= 2) {
    if (ts.includes(qs) && solid(qs, ts)) return 0.88;
    if (t.includes(qs) && solid(qs, t)) return 0.88;
  }

  const { ratio, shared } = overlap(q, t);
  if (shared < 2 || ratio < 0.5) return 0;
  return ratio * 0.85;
}

/** 語のいずれかに近ければ最大値を返す */
export function bestSimilarity(query: string, terms: (string | null | undefined)[]): number {
  let best = 0;
  for (const t of terms) {
    if (!t) continue;
    const v = similarity(query, t);
    if (v > best) best = v;
  }
  return best;
}
