import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { hashToken, generateToken } from "@/lib/intake";
import { FRANK_STORE_CODE as HIMEJI_STORE_CODE } from "@yozan/core/frank-booking";
import { corporateSpec, memberDisplayName } from "@yozan/core/frank-corporate";

export const MEMBER_COOKIE = "mos_member";
/**
 * 会員ポータルのセッション（#154 で 60日 → 1年）。
 * ポータルは「来店したら開くもの」にしたいので、来るたびにログインを求めたら習慣にならない。
 * 短くしても安全は増えない（cookieはhttpOnly/secure、退会・却下は下で即無効化している）ので、
 * 期限は長くとり、残り半年を切ったら自動で延長する＝実質ログインし続ける。
 */
const SESSION_DAYS = 365;
/** 残りがこれを下回ったら延長する（書き込みは最大でも半年に1回） */
const SESSION_EXTEND_UNDER_DAYS = 180;

export type MemberSession = {
  companyId: string;
  memberNo: string;
  /** お名前だけ（従来どおり） */
  name: string;
  /** 画面に出す名前。法人の方は「会社名＋お名前」（#204） */
  displayName: string;
  isProvisional: boolean;
  /** frunk_members.id（法人の画面で必要。旧台帳の会員は null） */
  memberId: string | null;
  /**
   * 法人プランのときだけ入る（#204）。
   *   isContract  ご契約者の行か（＝ご利用者の管理ができるのはこの方だけ）
   *   selfUse     ご担当者ご自身もご利用者として登録済みか（予約できるか）
   *   maxUsers    ご登録人数の上限。null = 無制限
   */
  corporate: {
    companyName: string | null;
    isContract: boolean;
    parentId: string | null;
    selfUse: boolean;
    maxUsers: number | null;
    maxOpenSlots: number;
    companionFree: boolean;
    planName: string | null;
  } | null;
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
  const expiresAt = new Date(sess.expires_at as string).getTime();
  if (expiresAt < Date.now()) return null;

  // 使っている人の期限は自動で延ばす（毎回書かないよう、残り半年を切ったときだけ）
  if (expiresAt - Date.now() < SESSION_EXTEND_UNDER_DAYS * 24 * 60 * 60 * 1000) {
    const next = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await admin.from("res_member_sessions")
      .update({ expires_at: next.toISOString() })
      .eq("token_hash", hashToken(raw));
    try {
      // Next.js ではサーバーコンポーネントの描画中に cookie を書けない（Route Handler と
      // Server Action だけ）。ここは両方から呼ばれるので、書けない場面は黙って諦める。
      // ポータルは滞在中ずっと /member/visit（Route Handler）を叩いているので、
      // cookie の期限はそちらで必ず更新される。
      const jar = await cookies();
      jar.set(MEMBER_COOKIE, raw, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: next });
    } catch {
      /* 描画中の呼び出し。DB側の期限は延びているので次のRoute Handlerで揃う */
    }
  }

  const companyId = sess.company_id as string;
  const memberNo = sess.member_no as string;
  const isProvisional = !!sess.is_provisional;

  let name = memberNo;
  let displayName = memberNo;
  let memberId: string | null = null;
  let corporate: MemberSession["corporate"] = null;
  if (isProvisional) {
    const { data: m } = await admin
      .from("mbr_provisional_members")
      .select("name")
      .eq("company_id", companyId).eq("member_no", memberNo).maybeSingle();
    if (m?.name) name = displayName = m.name as string;
  } else {
    // FRANK会員の台帳は frunk_members 一本（#93）。以前は旧台帳 mbr_members を見ており、
    // Web入会・タブレット入会の会員は氏名が出ず「FR0001 様」表示になっていた（#136）
    const { data: fm } = await admin
      .from("frunk_members")
      .select("id, name, status, company_name, corporate_parent_id, corporate_self_use, frunk_plans(name, is_corporate, max_users, max_open_slots, max_bookings_per_day, companion_free)")
      .eq("company_id", companyId).eq("member_no", memberNo)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (fm) {
      // 退会・却下済みはセッションを無効化（長期cookieだけで居座れないように）
      if (["left", "rejected"].includes(String(fm.status))) return null;
      if (fm.name) name = fm.name as string;
      memberId = String(fm.id);
      // 法人の方は「会社名＋お名前」で出す（#204。受付でも台帳でもどの会社か分かるように）
      displayName = memberDisplayName(fm as never) || name;
      const plan = (fm as unknown as { frunk_plans: { name?: string } | null }).frunk_plans;
      const spec = corporateSpec(plan as never);
      if (spec.isCorporate) {
        corporate = {
          companyName: (fm.company_name as string | null) ?? null,
          isContract: !fm.corporate_parent_id,
          parentId: (fm.corporate_parent_id as string | null) ?? null,
          selfUse: !!fm.corporate_self_use,
          maxUsers: spec.maxUsers,
          maxOpenSlots: spec.maxOpenSlots,
          companionFree: spec.companionFree,
          planName: plan?.name ?? null,
        };
      }
    } else {
      const { data: m } = await admin
        .from("mbr_members")
        .select("name")
        .eq("company_id", companyId).eq("member_no", memberNo).maybeSingle();
      if (m?.name) name = displayName = m.name as string;
    }
  }
  return { companyId, memberNo, name, displayName, isProvisional, memberId, corporate };
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
