import "server-only";
import { createHmac } from "crypto";
import { cookies } from "next/headers";

const COOKIE = "payroll_auth";
const TTL_SEC = 15 * 60; // 15分（SECURITY.md）

function sign(staffId: string, exp: number) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${staffId}.${exp}`)
    .digest("base64url");
}

/** 給与画面の再認証を付与（パスワード確認後に呼ぶ） */
export async function grantPayrollAccess(staffId: string) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEC;
  const value = `${staffId}.${exp}.${sign(staffId, exp)}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_SEC,
    path: "/",
  });
}

export async function hasPayrollAccess(staffId: string): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return false;
  const [sid, expStr, sig] = raw.split(".");
  if (sid !== staffId) return false;
  const exp = Number(expStr);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  return sig === sign(sid, exp);
}
