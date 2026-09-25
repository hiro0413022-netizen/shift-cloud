/**
 * コーチ紹介の中身を整える（#279・2026-09-25 ユーザー依頼）
 *
 * ユーザー指示:「権限のある店舗スタッフが、管理画面からコーチの追加／写真の追加・変更／
 *   名前の変更／紹介文の変更をできるように。保存後は会員向けトップページに反映」
 *
 * ★ 1つの行を、会員ページのトップと公式サイト frankgolf.jp の両方が読む。
 *   画面ごとに整形の仕方が違うと、同じ人の紹介が2か所で食い違う。
 *   ここで「表に出す形」を1つに決めて、両方がこれを呼ぶ。
 *
 * ★ 出さない人は、ここでも落とす（#243・2026-09-25 ユーザー指示）
 *   公式LINEに名前を出さないスタッフ（staff.line_hidden）は、コーチ紹介にも出さない。
 *   コーチ紹介は公開面なので、LINEより強い意味で「出さない」。
 *   管理画面の候補からも外すが、**万一データに入ってしまっても表に出ない**ように
 *   公開用の変換（publicCoaches）でもう一度落とす。守りは2枚重ねる。
 */

export type CoachRow = {
  id: string;
  name: string | null;
  name_en?: string | null;
  title?: string | null;
  photo_url?: string | null;
  bio?: string | null;
  quals?: string | null;
  sort_order?: number | null;
  published?: boolean | null;
  staff_id?: string | null;
  /** コーチごとの外部リンク（YouTubeなど・0204） */
  link_url?: string | null;
  link_label?: string | null;
};

/** 画面に出すときの形。紹介文と資格は行に割っておく（HTMLの改行を各画面で作らせない） */
export type PublicCoach = {
  id: string;
  name: string;
  nameEn: string;
  title: string;
  photoUrl: string;
  /** 紹介文。段落ごとに1要素 */
  bio: string[];
  /** 資格・実績。1行1つ */
  quals: string[];
  /** 外部リンク（無ければ空文字。ボタンを出さない） */
  linkUrl: string;
  linkLabel: string;
};

const trim = (v: unknown): string => String(v ?? "").trim();

/** 改行で割って、空行を落とす（コピペの余白で空の箇条書きが出ないように） */
export function splitLines(v: unknown): string[] {
  return trim(v)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 表に出せる行か（下書き・削除済み・名前なしは出さない） */
export function isShowable(row: CoachRow): boolean {
  if (row.published === false) return false;
  return trim(row.name).length > 0;
}

/**
 * 公開用に整える。
 * @param hiddenStaffIds 名前を出さないスタッフのid（staff.line_hidden）。紐づく行は落とす
 */
export function publicCoaches(rows: CoachRow[], hiddenStaffIds: string[] = []): PublicCoach[] {
  const hidden = new Set(hiddenStaffIds.filter(Boolean));
  return rows
    .filter(isShowable)
    .filter((r) => !(r.staff_id && hidden.has(r.staff_id)))
    .sort((a, b) => {
      const sa = Number(a.sort_order ?? 100);
      const sb = Number(b.sort_order ?? 100);
      if (sa !== sb) return sa - sb;
      return trim(a.name).localeCompare(trim(b.name), "ja");
    })
    .map((r) => ({
      id: String(r.id),
      name: trim(r.name),
      nameEn: trim(r.name_en),
      title: trim(r.title),
      photoUrl: trim(r.photo_url),
      bio: splitLines(r.bio),
      quals: splitLines(r.quals),
      linkUrl: /^https?:\/\//i.test(trim(r.link_url)) ? trim(r.link_url) : "",
      linkLabel: trim(r.link_label) || "くわしく見る",
    }));
}

export type CoachInput = {
  name: string;
  name_en: string | null;
  title: string | null;
  photo_url: string | null;
  bio: string | null;
  quals: string | null;
  sort_order: number;
  published: boolean;
  staff_id: string | null;
  link_url: string | null;
  link_label: string | null;
};

export type CoachInputResult = { ok: true; value: CoachInput } | { ok: false; message: string };

/** 写真URLとして受け取ってよいか。http(s) と、アップロード直後の相対パスだけ */
function cleanPhotoUrl(v: unknown): string | null {
  const s = trim(v);
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return null; // javascript: や data: を弾く
}

/** 管理画面の入力を、そのまま保存できる形に直す（空欄は null にして「空文字」を残さない） */
export function normalizeCoachInput(raw: Record<string, unknown>): CoachInputResult {
  const name = trim(raw.name);
  if (!name) return { ok: false, message: "お名前を入れてください" };
  if (name.length > 40) return { ok: false, message: "お名前が長すぎます（40文字まで）" };

  const bio = trim(raw.bio);
  if (bio.length > 1200) return { ok: false, message: "紹介文が長すぎます（1200文字まで）" };
  const quals = trim(raw.quals);
  if (quals.length > 600) return { ok: false, message: "資格・実績が長すぎます（600文字まで）" };

  const rawSort = Number(raw.sort_order);
  const sort = Number.isFinite(rawSort) ? Math.max(0, Math.min(9999, Math.floor(rawSort))) : 100;

  return {
    ok: true,
    value: {
      name,
      name_en: trim(raw.name_en) || null,
      title: trim(raw.title) || null,
      photo_url: cleanPhotoUrl(raw.photo_url),
      bio: bio || null,
      quals: quals || null,
      sort_order: sort,
      published: raw.published === true || raw.published === "on" || raw.published === "true",
      staff_id: /^[0-9a-f-]{36}$/i.test(trim(raw.staff_id)) ? trim(raw.staff_id) : null,
      link_url: /^https?:\/\//i.test(trim(raw.link_url)) ? trim(raw.link_url) : null,
      link_label: trim(raw.link_label) || null,
    },
  };
}

/** 写真の受け入れ条件（管理画面とサーバーで同じ文言を出す） */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function checkPhoto(file: { type?: string; size?: number } | null): string | null {
  if (!file || !file.size) return null; // 未選択は「変更しない」
  if (!PHOTO_TYPES.includes(String(file.type))) return "写真は JPEG・PNG・WebP のいずれかにしてください";
  if (Number(file.size) > PHOTO_MAX_BYTES) return "写真が大きすぎます（8MBまで）";
  return null;
}
