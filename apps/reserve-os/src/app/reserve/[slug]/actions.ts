"use server";

import { redirect } from "next/navigation";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { jstLocalToISO } from "@/lib/reserve";
import { notifyStaffNewRequest, ackCustomer, notifyLine, siteUrl } from "@/lib/mail";
import { createStaffTask } from "@/lib/staff-task";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

export type SubmitState = { error?: string };

/** お客様Web予約申込（公開ルート・service_role経由・第3希望＋事前ヒアリング） */
export async function submitRequest(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const slug = str(formData.get("slug"));
  if (!slug) return { error: "不正なリクエストです。" };

  const admin = createAdmin();
  const { data: service } = await admin
    .from("res_services")
    .select("id, company_id, store_id, name, category, active")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!service || !service.active) return { error: "現在このメニューはご予約を受け付けていません。" };

  // 必須項目
  const name = str(formData.get("name"));
  const nameKana = str(formData.get("name_kana"));
  const phone = str(formData.get("phone"));
  const email = str(formData.get("email"));
  const handedness = str(formData.get("handedness"));
  const age = str(formData.get("age"));
  const avgScore = str(formData.get("avg_score"));
  const pref1 = jstLocalToISO(str(formData.get("pref1_at")));
  const pref2 = jstLocalToISO(str(formData.get("pref2_at")));
  const pref3 = jstLocalToISO(str(formData.get("pref3_at")));
  const consent = str(formData.get("consent"));

  // LINE（LIFF）から開かれた場合は userId が付く。連絡はLINEで完結するのでメールは任意（DECISIONS #56）
  const lineUserId = str(formData.get("line_user_id"));
  const lineDisplayName = str(formData.get("line_display_name"));

  if (!name) return { error: "お名前を入力してください。" };
  if (!nameKana) return { error: "ふりがなを入力してください。" };
  if (!phone) return { error: "電話番号を入力してください。" };
  if (!email && !lineUserId) return { error: "メールアドレスを入力してください。" };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "メールアドレスの形式をご確認ください。" };
  if (!pref1 || !pref2 || !pref3) return { error: "ご希望日時を第3希望まで（3つ）ご入力ください。" };
  if (new Set([pref1, pref2, pref3]).size < 3) return { error: "第1〜第3希望は異なる日時をご指定ください。" };
  if (!handedness) return { error: "利き手をお選びください。" };
  if (!age) return { error: "年齢をご入力ください。" };
  if (!avgScore) return { error: "現在の平均スコアをご入力ください。" };
  if (!consent) return { error: "注意事項へのご同意が必要です。" };

  const ageNum = parseInt(age, 10);

  const { data: inserted, error } = await admin
    .from("res_requests")
    .insert({
      company_id: service.company_id,
      store_id: service.store_id,
      service_id: service.id,
      service_category: service.category,
      service_name: service.name,
      name,
      name_kana: nameKana,
      phone,
      email: email || null,
      line_user_id: lineUserId || null,
      line_display_name: lineDisplayName || null,
      handedness: handedness === "left" ? "left" : "right",
      age: Number.isFinite(ageNum) ? ageNum : null,
      avg_score: avgScore,
      pref1_at: pref1,
      pref2_at: pref2,
      pref3_at: pref3,
      head_speed: orNull(formData.get("head_speed")),
      club_maker: orNull(formData.get("club_maker")),
      club_model: orNull(formData.get("club_model")),
      club_shaft: orNull(formData.get("club_shaft")),
      club_flex: orNull(formData.get("club_flex")),
      golf_experience: orNull(formData.get("golf_experience")),
      concern: orNull(formData.get("concern")),
      improvement: orNull(formData.get("improvement")),
      target_distance: orNull(formData.get("target_distance")),
      bring_clubs: orNull(formData.get("bring_clubs")),
      other_notes: orNull(formData.get("other_notes")),
      source: lineUserId ? "line" : "web",
      status: "pending",
    })
    .select("*")
    .single();

  if (error || !inserted) {
    console.error("[reserve] insert失敗:", error);
    return { error: "送信に失敗しました。時間をおいて再度お試しください。" };
  }

  // スタッフポータルの「やること」に積む（現状の唯一の一次導線 / DECISIONS #55）。
  // メール未設定でもここが動けば申込は必ずスタッフの目に入る。
  await createStaffTask(inserted, siteUrl()).catch((e) => {
    console.error("[reserve] やること作成に失敗:", e);
  });

  // 通知（メール送信の失敗で申込自体は失敗させない）
  const [staffRes, ackRes] = await Promise.all([
    notifyStaffNewRequest(inserted).catch((e) => { console.error(e); return { ok: false }; }),
    ackCustomer(inserted).catch((e) => { console.error(e); return { ok: false }; }),
  ]);
  await notifyLine(inserted).catch(() => {});

  const patch: Record<string, string> = {};
  if (staffRes.ok) patch.notified_at = new Date().toISOString();
  if (ackRes.ok) patch.ack_sent_at = new Date().toISOString();
  if (Object.keys(patch).length) {
    await admin.from("res_requests").update(patch).eq("id", inserted.id);
  }

  await logEvent(service.company_id as string, {
    event_type: "reserve.web_request",
    title: `予約申込: ${name} 様 / ${service.name}`,
    description: `第1希望 ${pref1}`,
    source: "web",
    source_type: "external",
    severity: "info",
    status: "pending",
  });

  redirect(`/reserve/${slug}?done=1`);
}
