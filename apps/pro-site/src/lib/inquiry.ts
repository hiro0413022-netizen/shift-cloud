// ============================================================
// お問い合わせ（#235/#236）の種類・入力チェック・メール本文のひな形。
// 画面（contact-methods.tsx / contact-form.tsx）とサーバー（contact/actions.ts）が
// この1か所を使う＝「画面では通ったのにサーバーで弾かれる」「種類の表記が画面ごとに違う」を起こさない。
// server-only を付けない（クライアントからも読むため、秘密は置かない）。
// ============================================================

export const INQUIRY_KINDS = [
  { key: "media", label: "取材・メディア出演", hint: "テレビ・雑誌・Web・YouTubeなど" },
  { key: "sponsor", label: "スポンサー・協賛", hint: "契約・用具提供・協賛のご相談" },
  { key: "event", label: "レッスン・イベント出演", hint: "レッスン・コンペ・イベントへのご依頼" },
  { key: "other", label: "応援メッセージ・その他", hint: "ファンの方からのメッセージなど" },
] as const;

export type InquiryKind = (typeof INQUIRY_KINDS)[number]["key"];

export function isInquiryKind(v: string): v is InquiryKind {
  return INQUIRY_KINDS.some((k) => k.key === v);
}

export function inquiryKindLabel(v: string): string {
  return INQUIRY_KINDS.find((k) => k.key === v)?.label ?? "その他";
}

// ============================================================
// メールのひな形（#236）
// 押した瞬間にお客様のメールアプリが「件名・宛名・書く項目」入りで開く。
// 白紙のメールだと何を書けばよいか分からず、こちらも聞き返しが増える。
// ============================================================

export function mailSubject(kind: string, proName: string): string {
  return `【${inquiryKindLabel(kind)}】${proName}様へのお問い合わせ`;
}

export function mailBody(kind: string, proName: string): string {
  const common = [
    "",
    "──────────────",
    "お名前　　：",
    "会社・団体：",
    "ご連絡先　：（電話 / メール）",
    "──────────────",
    "",
  ];
  const detail: Record<string, string[]> = {
    media: ["ご依頼内容（媒体名・企画・撮影日時・場所）:", "", ""],
    sponsor: ["ご相談内容（ご提供いただける内容・ご希望の掲出）:", "", ""],
    event: ["ご依頼内容（イベント名・日時・場所・想定人数）:", "", ""],
    other: ["メッセージ:", "", ""],
  };
  return [`${proName} 様`, "", "はじめまして。オフィシャルサイトを拝見してご連絡いたしました。", ...common, ...(detail[kind] ?? detail.other)].join(
    "\n",
  );
}

/** mailto: のURL（件名・本文をURLエンコードして付ける） */
export function mailtoUrl(email: string, kind: string, proName: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(mailSubject(kind, proName))}&body=${encodeURIComponent(
    mailBody(kind, proName),
  )}`;
}

/** LINEの友だち追加URLかどうか（管理画面の入力チェック用） */
export function isLineUrl(url: string): boolean {
  return /^https:\/\/(lin\.ee\/|line\.me\/|page\.line\.me\/)/.test(url);
}

/** 電話番号を数字とハイフンだけに整える（空文字なら未設定） */
export function normalizePhone(raw: string): string {
  return raw.normalize("NFKC").replace(/[‐－―ー−]/g, "-").replace(/[^0-9+\-]/g, "").trim();
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

// ============================================================
// フォーム（メールアプリが開かない方のための控え。送信してもメールは飛ばず、管理画面に残るだけ）
// ============================================================

export type InquiryInput = {
  kind: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  message: string;
};

export const INQUIRY_LIMITS = { name: 50, company: 100, email: 254, phone: 20, messageMin: 5, messageMax: 3000 } as const;

// 実務で困らない程度の形式チェック（厳密なRFC判定はしない）
const EMAIL_RE = /^[^\s@<>()，、]+@[^\s@<>()，、]+\.[^\s@<>()，、]{2,}$/;

/** 全角英数・全角記号を半角に寄せる（メールアドレスと電話番号だけ） */
function toHalf(s: string): string {
  return s.normalize("NFKC").replace(/[‐－―ー−]/g, "-");
}

/** メールアドレスを整える（全角→半角・空白除去・小文字） */
export function normalizeEmail(raw: string): string {
  return toHalf(raw).replace(/\s+/g, "").toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= INQUIRY_LIMITS.email && EMAIL_RE.test(email);
}

/** 入力を整えてチェック。エラーは最初の1つだけ返す（スマホで上から直してもらう） */
export function normalizeInquiry(raw: InquiryInput): { values: InquiryInput; error: string | null } {
  const values: InquiryInput = {
    kind: raw.kind.trim(),
    name: raw.name.replace(/\s+/g, " ").trim(),
    company: raw.company.replace(/\s+/g, " ").trim(),
    email: normalizeEmail(raw.email),
    phone: toHalf(raw.phone).replace(/[^0-9+\-() ]/g, "").trim(),
    message: raw.message.replace(/\r\n?/g, "\n").trim(),
  };
  if (!isInquiryKind(values.kind)) return { values, error: "お問い合わせの種類を選んでください。" };
  if (!values.name) return { values, error: "お名前を入力してください。" };
  if (values.name.length > INQUIRY_LIMITS.name) return { values, error: `お名前は${INQUIRY_LIMITS.name}文字以内で入力してください。` };
  if (values.company.length > INQUIRY_LIMITS.company) return { values, error: `会社・団体名は${INQUIRY_LIMITS.company}文字以内で入力してください。` };
  if (!values.email) return { values, error: "メールアドレスを入力してください。" };
  if (!isValidEmail(values.email)) {
    return { values, error: "メールアドレスの形式をご確認ください。" };
  }
  if (values.phone && (values.phone.replace(/\D/g, "").length < 9 || values.phone.length > INQUIRY_LIMITS.phone)) {
    return { values, error: "電話番号をご確認ください（ご入力は任意です）。" };
  }
  if (values.message.length < INQUIRY_LIMITS.messageMin) return { values, error: "お問い合わせ内容を入力してください。" };
  if (values.message.length > INQUIRY_LIMITS.messageMax) {
    return { values, error: `お問い合わせ内容は${INQUIRY_LIMITS.messageMax}文字以内でお願いします。` };
  }
  return { values, error: null };
}
