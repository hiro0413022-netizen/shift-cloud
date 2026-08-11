import "server-only";
import { randomBytes } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import { sendFrankMail } from "@/lib/frank-mail";
import { buildJoinPdf } from "@/lib/frank-join-pdf";
import { monthlyFeeTaxIncluded } from "@/lib/frank-pos-pure";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { logEvent } from "@/lib/kernel";

type Admin = ReturnType<typeof createAdmin>;

/**
 * FRANK Web入会（即決済・#129）: 初回月会費の入金Webhookから呼ばれる「入会の確定」。
 *
 * やること（すべてこの1箇所・スタッフ承認は挟まない）:
 *  1. 会員番号 FR#### の採番（unique index 0108 + リトライで衝突安全）＋ status='active'
 *  2. Lesson OS カルテ（lsn_students）の自動作成＋閲覧用共有トークン
 *  3. 入会控えPDF（見本レイアウト）を生成し、完了メールに添付して送付
 *
 * 2・3はベストエフォート（失敗しても入会の確定は成立させ、eventsに警告を残す）。
 */

const MEMBER_OS_URL = process.env.NEXT_PUBLIC_MEMBER_OS_URL || "https://member-os-tau.vercel.app";
const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";
const FRANK_SITE = "https://frankgolf.jp";

/** 会員番号 FR#### の採番（同時申込は unique index が衝突させ、リトライで次番号へ） */
export async function assignMemberNo(admin: Admin, companyId: string, memberId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count } = await admin
      .from("frunk_members")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .not("member_no", "is", null);
    const memberNo = `FR${String((count ?? 0) + 1 + attempt).padStart(4, "0")}`;
    const { error } = await admin
      .from("frunk_members")
      .update({ member_no: memberNo, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .is("member_no", null);
    if (!error) return memberNo;
    // 一意制約違反（23505）だけリトライ。他のエラーは打ち切り
    if (!String(error.code ?? "").includes("23505")) {
      console.error("[frank-join] member_no assign failed:", error);
      return null;
    }
  }
  return null;
}

/** Lesson OS: カルテを find-or-create し、閲覧用の共有トークンを返す */
async function ensureLessonKarte(
  admin: Admin,
  m: { companyId: string; name: string; memberNo: string },
): Promise<string | null> {
  const { data: existing } = await admin
    .from("lsn_students")
    .select("id")
    .eq("company_id", m.companyId)
    .eq("member_code", m.memberNo)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  let studentId = existing ? String(existing.id) : null;
  if (!studentId) {
    const { data: created } = await admin
      .from("lsn_students")
      .insert({
        company_id: m.companyId,
        store_id: FRANK_STORE_ID,
        name: m.name,
        member_code: m.memberNo,
        memo: "FRANK Web入会で自動作成（#129）",
        status: "active",
      })
      .select("id")
      .single();
    studentId = created ? String(created.id) : null;
  }
  if (!studentId) return null;

  const { data: tok } = await admin
    .from("lsn_share_tokens")
    .select("token")
    .eq("student_id", studentId)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (tok?.token) return String(tok.token);

  const token = randomBytes(18).toString("base64url");
  const { error } = await admin
    .from("lsn_share_tokens")
    .insert({ company_id: m.companyId, student_id: studentId, token });
  return error ? null : token;
}

export type WebJoinMemberRow = {
  id: string;
  company_id: string;
  status: string | null;
  name: string;
  name_kana: string | null;
  gender: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address1: string | null;
  start_date: string | null;
  signature: string | null;
  joining_fee_waived: boolean | null;
  frunk_plans: { name: string | null; monthly_price: number | null; joining_fee: number | null } | null;
};

/**
 * 初回入金を確認できた pending 会員を「入会確定」にする。
 * 戻り値は発行した会員番号（既に active なら null＝何もしない）。
 */
export async function activateWebJoin(admin: Admin, memberId: string): Promise<string | null> {
  const { data } = await admin
    .from("frunk_members")
    .select(
      "id, company_id, status, name, name_kana, gender, birth_date, phone, email, postal_code, address1, start_date, signature, joining_fee_waived, frunk_plans(name, monthly_price, joining_fee)"
    )
    .eq("id", memberId)
    .is("deleted_at", null)
    .maybeSingle();
  const m = data as unknown as WebJoinMemberRow | null;
  if (!m || m.status !== "pending") return null;

  const memberNo = await assignMemberNo(admin, m.company_id, m.id);
  if (!memberNo) {
    await logEvent(m.company_id, {
      event_type: "frunk.join_activate_failed",
      title: `入会確定に失敗（会員番号の採番）: ${m.name}様 — /frunk から手動で承認してください`.slice(0, 120),
      source: "frank_billing",
      source_type: "system",
      severity: "warning",
    });
    return null;
  }

  const today = jstYmd();
  await admin
    .from("frunk_members")
    .update({ status: "active", join_date: today, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", m.id);

  await logEvent(m.company_id, {
    event_type: "frunk.joined",
    title: `Web入会が確定: ${m.name}様（${memberNo}）決済完了・承認レス（#129）`.slice(0, 120),
    source: "frank_billing",
    source_type: "system",
  });

  // ---- ここからベストエフォート（失敗しても入会は確定済み） ----
  let karteToken: string | null = null;
  try {
    karteToken = await ensureLessonKarte(admin, { companyId: m.company_id, name: m.name, memberNo });
  } catch (e) {
    console.error("[frank-join] lesson karte failed:", e);
  }

  if (m.email) {
    const monthly = monthlyFeeTaxIncluded(Number(m.frunk_plans?.monthly_price ?? 0));
    const joinFeeEx = Number(m.frunk_plans?.joining_fee ?? 0);
    const joinFee = m.joining_fee_waived ? 0 : monthlyFeeTaxIncluded(joinFeeEx);
    let attachments: Array<{ filename: string; content: string }> | undefined;
    try {
      const pdf = await buildJoinPdf({
        appliedOn: today.replaceAll("-", "/"),
        memberNo,
        name: m.name,
        nameKana: m.name_kana,
        gender: m.gender,
        birthDate: m.birth_date,
        phone: m.phone,
        email: m.email,
        postalCode: m.postal_code,
        address: m.address1,
        planName: String(m.frunk_plans?.name ?? ""),
        startDate: m.start_date,
        monthlyFeeTaxIncluded: monthly,
        joiningFeeTaxIncluded: joinFee,
        couponApplied: !!m.joining_fee_waived,
        signatureDataUrl: m.signature,
      });
      attachments = [{ filename: `FRANK_GOLF_入会申込書_${memberNo}.pdf`, content: Buffer.from(pdf).toString("base64") }];
    } catch (e) {
      console.error("[frank-join] pdf failed:", e);
      await logEvent(m.company_id, {
        event_type: "frunk.join_pdf_failed",
        title: `入会控えPDFの生成に失敗: ${m.name}様（${memberNo}）メールは控えなしで送信`.slice(0, 120),
        source: "frank_billing",
        source_type: "system",
        severity: "warning",
      });
    }

    const lines = [
      `${m.name} 様`,
      "",
      "FRANK GOLF へのご入会ありがとうございます。お支払いを確認し、ご入会が確定しました。",
      "",
      `■ あなたの会員番号: ${memberNo}`,
      "",
      "■ 打席のWeb予約",
      `${FRANK_SITE}/booking.html から「会員番号＋電話番号下4桁」でご予約いただけます。`,
      "",
      "■ 会員ページ（予約の確認・レッスンカルテ）",
      `${MEMBER_OS_URL}/member/login`,
      "ログインは会員番号＋電話番号下4桁です。",
      ...(karteToken
        ? ["", "■ あなたのレッスンカルテ", `${LESSON_OS_URL}/s/${karteToken}`, "レッスンの記録・動画・コーチのコメントをいつでもご覧いただけます。"]
        : []),
      "",
      "■ 月会費のお支払い",
      "ご登録のカードで毎月自動でお支払いになります。",
      ...(attachments ? ["", "入会申込書の控え（PDF）を添付しています。"] : []),
      "",
      "ご不明な点はこのメールにご返信ください。",
      "FRANK GOLF（姫路・土山）",
      FRANK_SITE,
    ];
    await sendFrankMail({
      to: m.email,
      subject: `【FRANK GOLF】ご入会ありがとうございます（会員番号 ${memberNo}）`,
      text: lines.join("\n"),
      attachments,
    });
  }

  return memberNo;
}
