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
  /** 画面の選択肢に出す店舗名（#198・どの店のグループか名前で分かるように） */
  store_name: string | null;
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
  const [{ data }, { data: stores }] = await Promise.all([
    admin
      .from("gn_line_groups")
      .select("id, line_group_id, label, store_id, is_default")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true }),
    admin.from("stores").select("id, name").eq("company_id", companyId).is("deleted_at", null),
  ]);
  const storeName = new Map((stores ?? []).map((x) => [String(x.id), String(x.name)]));
  return ((data ?? []) as Omit<LineGroup, "store_name">[]).map((g) => ({
    ...g,
    store_name: g.store_id ? storeName.get(String(g.store_id)) ?? null : null,
  }));
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

  /* 配信先グループを決める（#198）
     groupId='all' … 登録済みの全グループ（全店に伝えることだけ）
     groupId=<gid> … そのグループだけ
     未指定        … 本人が1店舗だけの所属ならその店、それ以外は既定
     ※「店の話が他店のLINEに出る」事故を避けるため、画面では必ず選ばせる。 */
  const groups = await getLineGroups(companyId);
  if (groups.length === 0) {
    return { ok: false, error: "LINEの配信先グループが未登録です（公式アカウントをスタッフグループに追加してください）" };
  }
  const mine =
    !actor.isOwner && actor.storeIds.length === 1
      ? groups.find((g) => g.store_id === actor.storeIds[0])
      : undefined;
  const targets =
    input.groupId === "all"
      ? groups
      : input.groupId
        ? groups.filter((g) => g.line_group_id === input.groupId)
        : [mine ?? groups.find((g) => g.is_default) ?? groups[0]];
  if (targets.length === 0 || !targets[0]) {
    return { ok: false, error: "配信先グループが見つかりません" };
  }

  const title = body.split("\n")[0].slice(0, 80);

  /* 任意: スタッフアプリの「やること」（店舗共通タスク）。
     #198: 配信先が複数のときは**送った店それぞれに**作る（片方の店にしか出ない、を作らない）。 */
  let spTaskId: string | null = null;
  if (input.asTask) {
    for (const g of targets) {
      if (!g.store_id) continue;
      const { data: task } = await admin
        .from("sp_tasks")
        .insert({
          company_id: companyId,
          staff_id: null, // 店舗共通（その店の全員に出る / DECISIONS #55）
          store_id: g.store_id,
          date: jstYmd(), // JST基準（UTCだと朝6時のcronで前日になる）
          title,
          note: body,
          status: "open",
          source: "genesis",
          created_by: actor.staffId,
        })
        .select("id")
        .single();
      spTaskId = spTaskId ?? task?.id ?? null; // 記録用に代表1件を持つ
    }
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

  /* ② LINEへ送る（#198）
     もとは gn_line_outbox に status='pending' で積み、n8n が拾って Push する設計だった。
     しかし #102 以降その拾い役は存在しない＝**積んだだけで永久に届かない**。
     スタッフ用OAのトークンでその場で Push し、outbox には履歴(status='sent')として残す。 */
  const { getLineChannel, linePush } = await import("@/lib/line");
  const staffCh = await getLineChannel(admin, companyId, "staff");
  if (!staffCh) return { ok: false, error: "記録はできましたが、スタッフ用LINEチャネルが未設定で送れません" };

  const sent: string[] = [];
  const failed: string[] = [];
  for (const g of targets) {
    const label = g.store_name ?? g.label ?? "グループ";
    try {
      await linePush(staffCh.access_token, g.line_group_id, body);
      sent.push(label);
      await admin.from("gn_line_outbox").insert({
        company_id: companyId,
        to_group_id: g.line_group_id,
        body,
        directive_id: dir.id,
        status: "sent",
        sent_at: new Date().toISOString(),
        created_by: actor.staffId,
      });
    } catch (e) {
      failed.push(label);
      await admin.from("gn_line_outbox").insert({
        company_id: companyId,
        to_group_id: g.line_group_id,
        body,
        directive_id: dir.id,
        status: "error",
        error: e instanceof Error ? e.message : "送信に失敗しました",
        created_by: actor.staffId,
      });
    }
  }
  // 届かなかったことは黙って捨てない（[[line-reply-pipeline]] の再発防止）
  if (sent.length === 0) return { ok: false, error: `記録はできましたがLINEに送れませんでした（${failed.join(" / ")}）` };

  await logEvent(companyId, {
    event_type: "notice.sent",
    title: `スタッフへ連絡: ${title}`.slice(0, 120),
    description: `配信先: ${sent.join(" / ")}${failed.length > 0 ? `（送信できず: ${failed.join(" / ")}）` : ""}${input.asTask ? " ＋やることリスト" : ""}`,
    source: "genesis",
    source_type: "human",
  });

  return { ok: true };
}
