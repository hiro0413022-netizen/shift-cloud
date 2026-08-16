import "server-only";
import { randomBytes } from "crypto";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import { sendFrankMail } from "@/lib/frank-mail";
import { buildJoinPdf } from "@/lib/frank-join-pdf";
import { monthlyFeeTaxIncluded } from "@/lib/frank-pos-pure";
import { joinInitialTotal } from "@/lib/frank-join-pure";
import { chargeCardOnFile } from "@/lib/frank-square-billing";
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
    const { data: updated, error } = await admin
      .from("frunk_members")
      .update({ member_no: memberNo, updated_at: new Date().toISOString() })
      .eq("id", memberId)
      .is("member_no", null)
      .select("member_no");
    if (!error) {
      if ((updated ?? []).length > 0) return memberNo;
      // 0行更新＝並行処理が先に採番済み。実際の番号を読み直して返す
      // （ここで memberNo を返すと「存在しない番号」がメール・PDFに載る）
      const { data: cur } = await admin.from("frunk_members").select("member_no").eq("id", memberId).maybeSingle();
      return cur?.member_no ? String(cur.member_no) : null;
    }
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
  join_campaign: string | null;
  square_customer_id: string | null;
  square_checkout_breakdown: {
    total?: number;
    joiningFee?: number;
    monthly?: number;
    prepaidMonths?: number;
    campaign?: boolean;
  } | null;
  frunk_plans: { name: string | null; monthly_price: number | null; joining_fee: number | null } | null;
};

/** JST日付に月を足す（毎月同日・末日は繰り下げ） */
function addMonthsYmd(ymd: string, months: number): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  // 例 8/31+1か月 → 10/1 になったら 9/30 に繰り下げ
  if (target.getUTCMonth() !== ((d.getUTCMonth() + months) % 12 + 12) % 12) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** 「2026-09-11」→ [9月, 10月, 11月] */
function monthLabels3(ymd: string): [string, string, string] {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  const out: string[] = [];
  for (let i = 0; i < 3; i++) out.push(`${new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)).getUTCMonth() + 1}月`);
  return out as [string, string, string];
}

/**
 * 初回入金を確認できた pending 会員を「入会確定」にする。
 * 戻り値は発行した会員番号（既に active なら null＝何もしない）。
 */
export async function activateWebJoin(admin: Admin, memberId: string): Promise<string | null> {
  const { data } = await admin
    .from("frunk_members")
    .select(
      "id, company_id, status, name, name_kana, gender, birth_date, phone, email, postal_code, address1, start_date, signature, joining_fee_waived, join_campaign, square_customer_id, square_checkout_breakdown, frunk_plans(name, monthly_price, joining_fee)"
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
  // 金額の内訳は「決済リンク発行時に確定したもの」（square_checkout_breakdown）を正とする。
  // 無い場合（旧データ）は申込フラグ＋本日日付で再計算（#136。二重定義で控えPDFと決済額がズレた事故の防止）
  const bd = m.square_checkout_breakdown;
  const est =
    bd && Number(bd.total ?? 0) > 0 && Number(bd.monthly ?? 0) > 0
      ? {
          total: Number(bd.total),
          joiningFee: Number(bd.joiningFee ?? 0),
          monthly: Number(bd.monthly),
          prepaidMonths: Number(bd.prepaidMonths ?? 2),
          campaign: !!bd.campaign,
        }
      : joinInitialTotal({
          monthlyExTax: Number(m.frunk_plans?.monthly_price ?? 0),
          joiningFeeExTax: Number(m.frunk_plans?.joining_fee ?? 0),
          applyDateYmd: today,
          joiningFeeWaived: !!m.joining_fee_waived,
        });
  const campaign = est.campaign || !!m.join_campaign;
  await admin
    .from("frunk_members")
    .update({
      status: "active",
      join_date: today,
      // キャンペーン入会は6か月間の継続をお願いしている（#131・退会操作時にスタッフへ警告）
      min_term_until: campaign ? addMonthsYmd(today, 6) : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", m.id);

  await logEvent(m.company_id, {
    event_type: "frunk.joined",
    title: `Web入会が確定: ${m.name}様（${memberNo}）決済完了・承認レス（#129）`.slice(0, 120),
    source: "frank_billing",
    source_type: "system",
  });

  // ---- ここからベストエフォート（失敗しても入会は確定済み） ----

  // 月会費は「入会金＋前取り月数分」を決済ページで1回いただいている（#131b）。
  // 以前あった「決済後に2回目をカード課金」は廃止（見積と決済額がズレる原因だった）。
  const monthly = est.monthly > 0 ? est.monthly : monthlyFeeTaxIncluded(Number(m.frunk_plans?.monthly_price ?? 0));

  let karteToken: string | null = null;
  try {
    karteToken = await ensureLessonKarte(admin, { companyId: m.company_id, name: m.name, memberNo });
  } catch (e) {
    console.error("[frank-join] lesson karte failed:", e);
  }

  if (m.email) {
    // 実際に決済した内訳（est）と必ず一致させる。ここで独自計算しない（#136）
    const joinFee = est.joiningFee;
    const [m0, m1, m2] = monthLabels3(today);
    const planName = String(m.frunk_plans?.name ?? "");
    // 控えPDFの費用欄（キャンペーンは 入会金0・入会月0・前取り2か月分を明示）
    const costRows: Array<[string, string]> = campaign
      ? [
          [`月会費 前取り（${m1}分）`, `${monthly.toLocaleString()}円（税込）`],
          [`月会費 前取り（${m2}分）`, `${monthly.toLocaleString()}円（税込）`],
          [`月会費（${m0}分・入会月）キャンペーン`, "0円"],
          ["入会金（年内入会キャンペーン）", "0円"],
        ]
      : [
          ...(joinFee > 0
            ? ([["入会金", `${joinFee.toLocaleString()}円（税込）`]] as Array<[string, string]>)
            : ([["入会金（クーポン適用）", "0円"]] as Array<[string, string]>)),
          [`月会費 前取り（${m1}分）`, `${monthly.toLocaleString()}円（税込）`],
          [`月会費 前取り（${m2}分）`, `${monthly.toLocaleString()}円（税込）`],
        ];
    // 決済額と必ず一致させる（決済リンク発行時に確定した内訳＝est.total）
    const totalDue = est.total;
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
        planName,
        startDate: m.start_date,
        monthlyFeeTaxIncluded: monthly,
        joiningFeeTaxIncluded: joinFee,
        couponApplied: !!m.joining_fee_waived,
        signatureDataUrl: m.signature,
        costRows,
        totalOverride: totalDue,
        remark: campaign ? `年内入会キャンペーン適用（6か月間の継続をお願いしています / ${addMonthsYmd(today, 6)}まで）` : null,
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
      ...(campaign
        ? [
            `年内入会キャンペーンの適用で、入会金（5,500円税込）と入会月（${m0}分）の月会費は無料です。`,
            `本日、${m1}分・${m2}分の月会費2か月分（${(monthly * 2).toLocaleString()}円税込）を1回でお支払いいただきました。`,
            // 前取りした月（m1・m2）の自動課金はスキップするため、次回の請求は「前取り最終月の翌月」＝入会日+（前取り月数+1）か月（#137）
            `${m2}分より後の月会費は、毎月${Number(today.slice(8, 10))}日ごろにご登録のカードへ自動でご請求します（次回 ${addMonthsYmd(today, est.prepaidMonths + 1).replaceAll("-", "/")} 予定）。`,
            `※ キャンペーンでのご入会は6か月間（${addMonthsYmd(today, 6).replaceAll("-", "/")}まで）の継続をお願いしています。`,
          ]
        : [
            `本日、入会金と${m1}分・${m2}分の月会費を1回でお支払いいただきました。`,
            `${m2}分より後の月会費は、毎月ご登録のカードへ自動でご請求します（次回 ${addMonthsYmd(today, est.prepaidMonths + 1).replaceAll("-", "/")} 予定）。`,
          ]),
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
