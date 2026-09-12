import "server-only";
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createAdmin } from "@/lib/db";

// ============================================================
// プロ本人（サイトオーナー）向けの軽量認証。
// スタッフ認証（@yozan/core）とは無関係の外販用: パスワード1本＋署名Cookie。
// 秘密鍵は SUPABASE_SERVICE_ROLE_KEY から導出（新envを増やさない）。
// ============================================================

const COOKIE = "pgw_admin";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30日

function secret(): Buffer {
  const base = process.env.PGW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base) throw new Error("セッション秘密鍵が未設定です");
  return createHash("sha256").update(`pgw|${base}`).digest();
}

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = scryptSync(plain, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export async function createSession(proId: string): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const payload = `${proId}.${exp}`;
  const store = await cookies();
  store.set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, "", { path: "/", maxAge: 0 });
}

/** ログイン中の pro_id（未ログイン/改ざん/期限切れは null） */
export async function sessionProId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [proId, expStr, sig] = parts;
  const payload = `${proId}.${expStr}`;
  const expect = sign(payload);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return null;
  return proId;
}

/** slug のプロにログインしているか検証し pro を返す（未ログインは null） */
export async function requireProAdmin(slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  const proId = await sessionProId();
  if (!proId) return null;
  const admin = createAdmin();
  const { data } = await admin
    .from("pgw_pros")
    .select("id, slug, name")
    .eq("id", proId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return data ?? null;
}

// ============================================================
// お問い合わせフォームの「表示時刻スタンプ」（#235 スパム対策）。
// ページ表示時に `時刻.署名` を埋め、送信時に「改ざんされていない」「表示から数秒たっている」を見る。
// 機械的な連投は表示→即送信なので弾ける。人間は数秒で書き終わらない。
// ============================================================

export function issueFormStamp(proId: string): string {
  const t = Date.now().toString();
  return `${t}.${sign(`form|${proId}|${t}`)}`;
}

/** ok: 使えるスタンプ / tooFast: 表示から早すぎる / invalid: 改ざん・形式不正 */
export function checkFormStamp(stamp: string, proId: string, minMs = 2500): "ok" | "tooFast" | "invalid" {
  const [t, sig] = stamp.split(".");
  if (!t || !sig || !/^\d{13}$/.test(t)) return "invalid";
  const expect = sign(`form|${proId}|${t}`);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return "invalid";
  if (Date.now() - Number(t) < minMs) return "tooFast";
  return "ok";
}

/** 連投制限用のIPハッシュ（生IPは保存しない） */
export function hashIp(ip: string): string {
  return sign(`ip|${ip}`).slice(0, 32);
}
