"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { validateTimeOff } from "@/lib/shift-scope";
import { todayJST, fmtDateJP } from "@/lib/util";

export type RequestEntry = { date: string; template_id: string | null; memo: string; start_time?: string | null; end_time?: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * シフト作成権限を持つスタッフ（＝提出を受け取る側）へ通知。
 * 募集期間を廃止した（#138）ので「開始／締切」で気づく仕組みが無くなった。
 * 代わりに提出のたびに知らせる＝出したのに気づかれない、を防ぐ。
 */
async function notifyShiftManagers(
  companyId: string,
  exceptStaffId: string,
  n: { title: string; body: string; link: string },
): Promise<void> {
  const admin = createAdmin();
  const { data: rows } = await admin
    .from("staff_roles")
    .select("staff_id, roles!inner(permissions)")
    .is("deleted_at", null);
  const targets = [...new Set(
    (rows ?? [])
      .filter((r) => (r as unknown as { roles: { permissions: Record<string, boolean> } }).roles?.permissions?.create_shifts)
      .map((r) => r.staff_id)
      .filter((id) => id !== exceptStaffId),
  )];
  if (!targets.length) return;
  await admin.from("notifications").insert(targets.map((sid) => ({
    company_id: companyId,
    staff_id: sid,
    kind: "shift_request_submitted",
    title: n.title,
    body: n.body,
    link: n.link,
  })));
}

/**
 * シフト提出（表示中の期間ぶんをまとめて保存）。
 *
 * 【#138】募集期間(period_id)は使わない。管理者が「募集を開始」しなくても、
 * 今日以降ならいつでも・何ヶ月先でも出せる。
 * - 入力のある日 → shift_requests を upsert（1人1日1件）＋ ドラフトシフトへ反映
 * - 空にした日   → その日の提出を取り下げ（論理削除）＋ ドラフトシフトも消す
 * - 確定済み(published)の日 → 触らない。変更は管理者が確定を解除してから（画面でもロック表示）
 */
export async function submitRequests(
  from: string,
  to: string,
  entries: RequestEntry[],
): Promise<{ error?: string; saved?: number; cleared?: number }> {
  const actor = await requireActor();
  const admin = createAdmin();

  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return { error: "対象期間が不正です" };
  const today = todayJST();
  // 過去日は出し直せない（もう働いた日を書き換えても意味がない）
  const editFrom = from < today ? today : from;
  if (editFrom > to) return { error: "過ぎた日は提出できません" };

  const storeId = actor.primaryStoreId ?? actor.storeIds[0] ?? null;

  // 確定済みの日は上書きしない。ロックは画面(UI)ではなくここで担保する（#134と同じ考え方）
  const { data: myShifts } = await admin.from("shifts")
    .select("date, status")
    .eq("staff_id", actor.staffId).is("deleted_at", null)
    .gte("date", editFrom).lte("date", to);
  const locked = new Set((myShifts ?? []).filter((s) => s.status === "published").map((s) => s.date));

  const filled: RequestEntry[] = [];
  const cleared: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!DATE_RE.test(e.date) || e.date < editFrom || e.date > to) continue;
    if (locked.has(e.date) || seen.has(e.date)) continue;
    seen.add(e.date);
    const hasContent = !!(e.template_id || (e.start_time && e.end_time) || (e.memo ?? "").trim());
    if (hasContent) filled.push(e); else cleared.push(e.date);
  }

  if (filled.length === 0 && cleared.length === 0) return { error: "提出できる日がありません" };

  if (filled.length) {
    const rows = filled.map((e) => ({
      company_id: actor.companyId,
      period_id: null,                      // #138 募集期間は使わない
      staff_id: actor.staffId,
      date: e.date,
      template_id: e.template_id,
      start_time: e.start_time || null,
      end_time: e.end_time || null,
      memo: (e.memo ?? "").trim() || null,
      status: "submitted" as const,
      deleted_at: null,                     // 取り下げた日を出し直したら復活させる
    }));
    const { error } = await admin.from("shift_requests").upsert(rows, { onConflict: "staff_id,date" });
    if (error) return { error: error.message };
  }

  if (cleared.length) {
    await admin.from("shift_requests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("company_id", actor.companyId)
      .eq("staff_id", actor.staffId).in("date", cleared).is("deleted_at", null);
  }

  // 提出内容をドラフトシフトへ反映（確定済みの日は上でも下でも触らない）
  if (storeId) {
    const templateIds = [...new Set(filled.map((e) => e.template_id).filter(Boolean))] as string[];
    const { data: templates } = templateIds.length
      ? await admin.from("shift_templates").select("id, start_time, end_time, is_day_off").in("id", templateIds)
      : { data: [] as { id: string; start_time: string | null; end_time: string | null; is_day_off: boolean }[] };
    const tmap = new Map((templates ?? []).map((t) => [t.id, t]));

    const drafts = filled
      .map((e) => {
        let start_time: string | null, end_time: string | null, is_day_off: boolean;
        if (e.template_id) {
          const t = tmap.get(e.template_id);
          if (!t) return null;
          start_time = t.start_time; end_time = t.end_time; is_day_off = t.is_day_off;
        } else if (e.start_time && e.end_time) {
          start_time = e.start_time; end_time = e.end_time; is_day_off = false;
        } else {
          return null;                      // メモだけの日はシフトにしない
        }
        return {
          company_id: actor.companyId,
          staff_id: actor.staffId,
          store_id: storeId,
          date: e.date,
          template_id: e.template_id,
          start_time,
          end_time,
          is_day_off,
          status: "draft" as const,
          published_at: null,
          deleted_at: null,
        };
      })
      .filter(Boolean) as Record<string, unknown>[];

    if (drafts.length) {
      await admin.from("shifts").upsert(drafts, { onConflict: "staff_id,store_id,date" });
    }

    // 空にした日＋「メモだけ」に変えた日のドラフトは消す（確定済みは status で守られる）
    const dropDates = [
      ...cleared,
      ...filled.filter((e) => !e.template_id && !(e.start_time && e.end_time)).map((e) => e.date),
    ];
    if (dropDates.length) {
      await admin.from("shifts").delete()
        .eq("staff_id", actor.staffId).eq("store_id", storeId)
        .in("date", dropDates).eq("status", "draft");
    }
  }

  await notifyShiftManagers(actor.companyId, actor.staffId, {
    title: `${actor.name}さんがシフトを提出しました`,
    body: `${fmtDateJP(from)}〜${fmtDateJP(to)} ・ ${filled.length}日分${cleared.length ? `（${cleared.length}日は取り下げ）` : ""}`,
    link: `/admin/shifts?span=month&d=${from}`,
  });

  await logAudit(actor, "shift_request.submit", "shift_requests", null, null, {
    from, to, saved: filled.length, cleared: cleared.length,
  });
  revalidatePath("/requests");
  revalidatePath("/admin/shifts");
  return { saved: filled.length, cleared: cleared.length };
}

/**
 * 休み希望を出す（募集期間に関係なくいつでも）。
 * 長期休暇のように「先に決まっている休み」を運営が早めに把握するための入口。
 */
export async function submitTimeOff(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const admin = createAdmin();

  const start = String(formData.get("start_date") || "");
  const end = String(formData.get("end_date") || "") || start;
  const kind = String(formData.get("kind") || "day_off");
  const reason = String(formData.get("reason") || "").trim() || null;

  if (validateTimeOff(start, end, todayJST())) return;

  const { data } = await admin.from("staff_time_off_requests").insert({
    company_id: actor.companyId,
    staff_id: actor.staffId,
    store_id: actor.primaryStoreId ?? actor.storeIds[0] ?? null,
    start_date: start,
    end_date: end,
    kind,
    reason,
    status: "submitted",
  }).select("id").single();

  await notifyShiftManagers(actor.companyId, actor.staffId, {
    title: `${actor.name}さんから休み希望`,
    body: `${start}${end !== start ? `〜${end}` : ""}${reason ? ` / ${reason}` : ""}`,
    link: "/admin/time-off",
  });

  await logAudit(actor, "time_off.submit", "staff_time_off_requests", data?.id ?? null, null, { start, end, kind });
  revalidatePath("/requests");
}

/** 自分の休み希望を取り下げる（承認済みでも取り下げ可＝予定は変わるもの） */
export async function withdrawTimeOff(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const admin = createAdmin();
  const id = String(formData.get("id"));

  await admin.from("staff_time_off_requests")
    .update({ status: "withdrawn" })
    .eq("id", id)
    .eq("staff_id", actor.staffId)          // 他人の申請は触れない
    .eq("company_id", actor.companyId);

  await logAudit(actor, "time_off.withdraw", "staff_time_off_requests", id);
  revalidatePath("/requests");
}

/** 出勤募集に応募する */
export async function applyHelp(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const admin = createAdmin();
  const helpRequestId = String(formData.get("help_request_id"));

  const { data: hr } = await admin.from("help_requests")
    .select("id, status")
    .eq("id", helpRequestId).eq("company_id", actor.companyId)
    .is("deleted_at", null).maybeSingle();
  if (!hr || hr.status !== "open") return;

  await admin.from("help_applications").upsert(
    {
      company_id: actor.companyId,
      help_request_id: helpRequestId,
      staff_id: actor.staffId,
      status: "pending",
    },
    { onConflict: "help_request_id,staff_id" }
  );
  await logAudit(actor, "help.apply", "help_applications", null, null, { helpRequestId });
  revalidatePath("/requests");
}
