import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { normalizeJpPhone, jpPhoneError } from "@yozan/core/jp-phone";

/**
 * キャスト用スマホのログイン。
 * スタッフ(staff)のSupabase Authとは別系統 — キャストは従業員名簿に載らない/入れ替わりも早いので、
 * 会員ポータル(res_member_sessions)と同じ「cookieに生トークン・DBにハッシュ」で持つ。
 *
 * 認証は 携帯番号 ＋ 4桁の暗証番号。
 * 給与が見える画面なので「名前を選ぶだけ」にはしない（受付タブレットとは別の判断）。
 */

export const CAST_COOKIE = "nite_cast";
const SESSION_DAYS = 90;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** 暗証番号のハッシュ。キャストIDを混ぜて、同じ暗証番号でも同じハッシュにならないようにする */
export function hashPin(castId: string, pin: string): string {
  return sha256(`nite:${castId}:${pin}`);
}

export function isPinShape(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export type CastSession = {
  castId: string;
  companyId: string;
  storeId: string;
  name: string;
  displayName: string;
  hourlyWage: number;
  rankName: string | null;
};

export async function signInCast(
  storeId: string,
  phoneInput: string,
  pin: string
): Promise<{ error?: string }> {
  const phoneErr = jpPhoneError(phoneInput);
  if (phoneErr) return { error: phoneErr };
  const phone = normalizeJpPhone(phoneInput);
  if (!isPinShape(pin)) return { error: "暗証番号は4桁の数字です" };

  const admin = createAdmin();
  const { data } = await admin
    .from("nite_casts")
    .select("id, company_id, pin_hash, status")
    .eq("store_id", storeId)
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();

  const row = data as { id: string; company_id: string; pin_hash: string | null; status: string } | null;
  // 番号が無い場合も同じ文言にする（どの番号が登録済みかを当てられないように）
  const fail = { error: "番号または暗証番号が違います" };
  if (!row || !row.pin_hash) return fail;
  if (row.status !== "active") return { error: "現在ログインできません。お店にご確認ください" };

  const expect = Buffer.from(row.pin_hash, "utf8");
  const actual = Buffer.from(hashPin(row.id, pin), "utf8");
  if (expect.length !== actual.length || !timingSafeEqual(expect, actual)) return fail;

  const token = randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await admin.from("nite_cast_sessions").insert({
    company_id: row.company_id,
    cast_id: row.id,
    token_hash: sha256(token),
    expires_at: expires.toISOString(),
  });

  const c = await cookies();
  c.set(CAST_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return {};
}

export async function getCastSession(): Promise<CastSession | null> {
  const c = await cookies();
  const token = c.get(CAST_COOKIE)?.value;
  if (!token) return null;

  const admin = createAdmin();
  const { data } = await admin
    .from("nite_cast_sessions")
    .select(
      "cast_id, company_id, expires_at, revoked_at, " +
        "nite_casts(id, store_id, name, display_name, status, hourly_wage_override, nite_cast_ranks(name, hourly_wage))"
    )
    .eq("token_hash", sha256(token))
    .maybeSingle();

  const row = data as unknown as {
    cast_id: string;
    company_id: string;
    expires_at: string;
    revoked_at: string | null;
    nite_casts: {
      id: string;
      store_id: string;
      name: string;
      display_name: string;
      status: string;
      hourly_wage_override: number | null;
      nite_cast_ranks: { name: string; hourly_wage: number } | null;
    } | null;
  } | null;

  if (!row || row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  const cast = row.nite_casts;
  // 退店・休職はその場でログアウトになる（セッションを消して回らなくてよい）
  if (!cast || cast.status !== "active") return null;

  return {
    castId: cast.id,
    companyId: row.company_id,
    storeId: cast.store_id,
    name: cast.name,
    displayName: cast.display_name,
    hourlyWage: cast.hourly_wage_override ?? cast.nite_cast_ranks?.hourly_wage ?? 0,
    rankName: cast.nite_cast_ranks?.name ?? null,
  };
}

export async function requireCast(): Promise<CastSession> {
  const s = await getCastSession();
  if (!s) redirect("/cast/login");
  return s;
}

export async function signOutCast(): Promise<void> {
  const c = await cookies();
  const token = c.get(CAST_COOKIE)?.value;
  if (token) {
    await createAdmin()
      .from("nite_cast_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", sha256(token));
  }
  c.delete(CAST_COOKIE);
}
