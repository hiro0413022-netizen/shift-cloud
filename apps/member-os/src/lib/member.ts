import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { hashToken, generateToken } from "@/lib/intake";
import { HIMEJI_STORE_CODE } from "@/lib/reservation";

export const MEMBER_COOKIE = "mos_member";
const SESSION_DAYS = 60;

export type MemberSession = {
  companyId: string;
  memberNo: string;
  name: string;
  isProvisional: boolean;
};

export type HimejiStore = {
  companyId: string;
  storeId: string;
  name: string;
  openTime: string | null;
  closeTime: string | null;
};

/** 姫路 FRANK GOLF の店舗・会社を解決（会員ポータルは姫路店スコープ） */
export async function resolveHimeji(): Promise<HimejiStore | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id, company_id, name, open_time, close_time")
    .eq("code", HIMEJI_STORE_CODE)
    .maybeSingle();
  if (!data) return null;
  return {
    companyId: data.company_id as string,
    storeId: data.id as string,
    name: data.name as string,
    openTime: (data.open_time as string | null) ?? null,
    closeTime: (data.close_time as string | null) ?? null,
  };
}

/** ログイン成功時にセッションを発行しcookieをセット */
export async function createMemberSession(companyId: string, memberNo: string, isProvisional: boolean): Promise<void> {
  const admin = createAdmin();
  const token = generateToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await admin.from("res_member_sessions").insert({
    company_id: companyId,
    member_no: memberNo,
    is_provisional: isProvisional,
    token_hash: hashToken(token),
    expires_at: expires.toISOString(),
  });
  const c = await cookies();
  c.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/** 現在の会員セッションを取得（未ログイン/期限切れはnull） */
export async function getMemberSession(): Promise<MemberSession | null> {
  const c = await cookies();
  const raw = c.get(MEMBER_COOKIE)?.value;
  if (!raw) return null;
  const admin = createAdmin();
  const { data: sess } = await admin
    .from("res_member_sessions")
    .select("company_id, member_no, is_provisional, expires_at")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  if (!sess) return null;
  if (new Date(sess.expires_at as string).getTime() < Date.now()) return null;

  const companyId = sess.company_id as string;
  const memberNo = sess.member_no as string;
  const isProvisional = !!sess.is_provisional;

  let name = memberNo;
  if (isProvisional) {
    const { data: m } = await admin
      .from("mbr_provisional_members")
      .select("name")
      .eq("company_id", companyId).eq("member_no", memberNo).maybeSingle();
    if (m?.name) name = m.name as string;
  } else {
    const { data: m } = await admin
      .from("mbr_members")
      .select("name")
      .eq("company_id", companyId).eq("member_no", memberNo).maybeSingle();
    if (m?.name) name = m.name as string;
  }
  return { companyId, memberNo, name, isProvisional };
}

export async function requireMember(): Promise<MemberSession> {
  const s = await getMemberSession();
  if (!s) redirect("/member/login");
  return s;
}

/** ログアウト（セッション削除＋cookieクリア） */
export async function clearMemberSession(): Promise<void> {
  const c = await cookies();
  const raw = c.get(MEMBER_COOKIE)?.value;
  if (raw) {
    const admin = createAdmin();
    await admin.from("res_member_sessions").delete().eq("token_hash", hashToken(raw));
  }
  c.delete(MEMBER_COOKIE);
}
