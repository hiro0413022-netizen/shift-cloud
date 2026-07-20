import "server-only";
import { jstYmd } from "@/lib/jst";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import type { GenesisActor } from "@/lib/auth";

/* ============================================================
   スタッフへ連絡（DECISIONS #59 / migration 0059）

   狙い: 古川さんが個別にLINEするのをやめ、Genesisで1回書けば
     ①記録が残る（gn_directives＝あとで追える）
     ②公式LINEでスタッフグループへ自動配信（gn_line_outbox→n8n）
     ③任意でスタッフアプリの「やること」にも出す（sp_tasks 店舗共通）

   数字や判断は絡まない単純な配信なので、LLMは使わない。
   LINE送信は n8n が gn_line_outbox(status=pending) を拾ってPushする（reserveと同じ方式）。
   ============================================================ */

export type LineGroup = {
  id: string;
  line_group_id: string;
  label: string | null;
  store_id: string | null;
  is_default: boolean;
};

export type NoticeRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
  line_status: string | null; // pending / sent / error / null(LINE未送信)
  line_error: string | null;
  as_task: boolean;
};

/** 配信先グループ一覧（既定を先頭に） */
export async function getLineGroups(companyId: string): Promise<LineGroup[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("gn_line_groups")
    .select("id, line_group_id, label, store_id, is_default")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as LineGroup[];
}

/** 連絡の履歴（gn_directives のうちスタッフ連絡＝origin_kind='notice'）＋LINE状態を突き合わせ */
export async function getNotices(companyId: string, limit = 30): Promise<NoticeRow[]> {
  const admin = createAdmin();
  const { data: dirs } = await admin
    .from("gn_directives")
    .select("id, title, body, created_at, sp_task_id")
    .eq("company_id", companyId)
    .eq("origin_kind", "notice")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (dirs ?? []) as { id: string; title: string; body: string | null; created_at: string; sp_task_id: string | null }[];
  if (rows.length === 0) return [];

  const { data: outbox } = await admin
    .from("gn_line_outbox")
    .select("directive_id, status, error")
    .in("directive_id", rows.map((r) => r.id));
  const byDir = new Map((outbox ?? []).map((o) => [o.directive_id as string, o]));

  return rows.map((r) => {
    const o = byDir.get(r.id) as { status: string; error: string | null } | undefined;
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      created_at: r.created_at,
      line_status: o?.status ?? null,
      line_error: o?.error ?? null,
      as_task: !!r.sp_task_id,
    };
  });
}

export type SendNoticeInput = {
  message: string;
  groupId?: string | null; // 送信先 line_group_id（未指定なら既定）
  asTask: boolean; // スタッフアプリの「やること」にも出すか
};

export type SendNoticeResult = { ok: boolean; error?: string };

/** スタッフへ連絡を送る（記録＋LINE配信キュー＋任意でやること） */
export async function sendStaffNotice(actor: GenesisActor, input: SendNoticeInput): Promise<SendNoticeResult> {
  const admin = createAdmin();
  const companyId = actor.companyId;
  const body = input.message.trim();
  if (!body) return { ok: false, error: "連絡内容を入力してください" };
  if (body.length > 4000) return { ok: false, error: "長すぎます（4000文字まで）" };

  // 配信先グループを決める（指定 or 既定）
  const groups = await getLineGroups(companyId);
  const group = input.groupId
    ? groups.find((g) => g.line_group_id === input.groupId)
    : groups.find((g) => g.is_default) ?? groups[0];
  if (!group) {
    return { ok: false, error: "LINEの配信先グループが未登録です（公式アカウントをスタッフグループに追加してください）" };
  }

  const title = body.split("\n")[0].slice(0, 80);

  // 任意: スタッフアプリの「やること」（店舗共通タスク）
  let spTaskId: string | null = null;
  if (input.asTask && group.store_id) {
    const { data: task } = await admin
      .from("sp_tasks")
      .insert({
        company_id: companyId,
        staff_id: null, // 店舗共通（その店の全員に出る / DECISIONS #55）
        store_id: group.store_id,
        date: jstYmd(), // JST基準（UTCだと朝6時のcronで前日になる）
        title,
        note: body,
        status: "open",
        source: "genesis",
        created_by: actor.staffId,
      })
      .select("id")
      .single();
    spTaskId = task?.id ?? null;
  }

  // ① 記録（gn_directives。origin_kind='notice' でスタッフ連絡と分かる）
  const { data: dir, error: dirErr } = await admin
    .from("gn_directives")
    .insert({
      company_id: companyId,
      target_kind: "staff",
      staff_id: null, // 全員宛（ブロードキャスト）
      title,
      body,
      status: "issued",
      origin_kind: "notice",
      sp_task_id: spTaskId,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (dirErr || !dir) return { ok: false, error: dirErr?.message ?? "記録に失敗しました" };

  // ② LINE配信キューへ（n8nが5分おき or 即時実行で拾ってPush）
  const { error: outErr } = await admin.from("gn_line_outbox").insert({
    company_id: companyId,
    to_group_id: group.line_group_id,
    body,
    directive_id: dir.id,
    status: "pending",
    created_by: actor.staffId,
  });
  if (outErr) return { ok: false, error: `記録はできましたがLINEキュー投入に失敗: ${outErr.message}` };

  await logEvent(companyId, {
    event_type: "notice.sent",
    title: `スタッフへ連絡: ${title}`.slice(0, 120),
    description: input.asTask ? "LINE配信＋やることリスト" : "LINE配信",
    source: "genesis",
    source_type: "human",
  });

  return { ok: true };
}
