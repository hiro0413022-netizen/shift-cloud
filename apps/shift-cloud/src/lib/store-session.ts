import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 店舗ダッシュボード（/store）のログインセッション。
 *
 * スタッフ認証（Supabase auth）とは別系統。ログイン画面で「店舗用ID＋パスワード」を入力すると
 * store_dash_logins を照合し、成功時に HMAC 署名付き Cookie（sd_session）を発行する。
 * /store はこの Cookie から companyId / storeId を解決して表示する（URLにトークンを出さない）。
 *
 * 秘密鍵は SUPABASE_SERVICE_ROLE_KEY を流用（サーバー限定・外部非公開）。鍵ローテーション時は
 * 既存セッションが失効するのみ（再ログインで回復）。
 */

const COOKIE = "sd_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日

function secret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

// ---- パスワード（scrypt: salt:hash の hex） ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---- セッションCookie（loginRowId.HMAC） ----

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function makeToken(loginRowId: string): string {
  return `${loginRowId}.${sign(loginRowId)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const id = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

export type StoreSession = { loginRowId: string; companyId: string; storeId: string };

/** ログインID＋パスワードを照合。成功なら店舗ログイン行を返す */
export async function verifyStoreLogin(
  loginId: string,
  password: string
): Promise<StoreSession | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("store_dash_logins")
    .select("id, company_id, store_id, password_hash, status")
    .ilike("login_id", loginId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  if (!verifyPassword(password, data.password_hash)) return null;
  return { loginRowId: data.id, companyId: data.company_id, storeId: data.store_id };
}

/** 指定 login_id が店舗ログインとして存在するか（スタッフ認証との切り分け用） */
export async function storeLoginExists(loginId: string): Promise<boolean> {
  const admin = createAdmin();
  const { data } = await admin
    .from("store_dash_logins")
    .select("id")
    .ilike("login_id", loginId)
    .is("deleted_at", null)
    .maybeSingle();
  return !!data;
}

/** ログイン成功時にCookieをセット */
export async function setStoreSession(loginRowId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(loginRowId), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearStoreSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Cookieから現在の店舗セッションを解決（無効なら null） */
export async function getStoreSession(): Promise<StoreSession | null> {
  const jar = await cookies();
  const loginRowId = readToken(jar.get(COOKIE)?.value);
  if (!loginRowId) return null;

  const admin = createAdmin();
  const { data } = await admin
    .from("store_dash_logins")
    .select("id, company_id, store_id, status")
    .eq("id", loginRowId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.status !== "active") return null;
  return { loginRowId: data.id, companyId: data.company_id, storeId: data.store_id };
}
