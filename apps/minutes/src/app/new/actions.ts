"use server";

import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { jstYmd } from "@yozan/core/jst";
import { requireActor } from "@/lib/auth";
import { isLevel, levelStatus } from "@/lib/levels";
import { isModeId, modeAllowed } from "@/lib/modes";

/**
 * 会議を作る。ここで機密レベルが決まり、以後は変えられない（DBのトリガーでも固定）。
 * 録音・ファイルは同意の確認が無ければ作らない。
 */
export async function createMeeting(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const actor = await requireActor();
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const dateRaw = String(form.get("meeting_date") ?? "");
  const participants = String(form.get("participants") ?? "").trim().slice(0, 500);
  const level = String(form.get("level") ?? "");
  const mode = String(form.get("mode") ?? "auto");
  const source = String(form.get("source") ?? "record");
  const consent = form.get("consent") === "on";

  if (!title) return { error: "件名を入力してください" };
  if (!isLevel(level)) return { error: "機密レベルを選んでください" };
  const st = levelStatus(level, process.env);
  if (!st.available) return { error: `${level} はいま使えません: ${st.reason}` };
  if (mode !== "auto" && (!isModeId(mode) || !modeAllowed(mode, level))) return { error: "このレベルでは選べない要約モードです" };
  if (!["record", "file", "text"].includes(source)) return { error: "取り込み方を選んでください" };
  if (!consent) return { error: "参加者の了承を確認してください" };

  const meetingDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : jstYmd();
  const admin = createAdmin();
  const { data, error } = await admin
    .from("mtg_meetings")
    .insert({
      company_id: actor.companyId,
      created_by: actor.staffId,
      title,
      meeting_date: meetingDate,
      participants: participants || null,
      level,
      mode,
      source,
      status: "draft",
      consent_at: new Date().toISOString(),
      consent_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "作成できませんでした" };
  redirect(`/m/${(data as { id: string }).id}`);
}
