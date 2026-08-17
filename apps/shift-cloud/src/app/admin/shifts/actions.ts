"use server";

import { revalidatePath } from "next/cache";
import { requireActor, assertStoreAccess } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type CellShift = {
  staff_id: string;
  date: string;
  template_id: string | null;          // null = クリア または 任意時刻
  start_time?: string | null;          // 任意時刻（テンプレ未使用時）"HH:MM"
  end_time?: string | null;
};

/** 1マス（誰の・いつ）の指定。確定／確定解除で使う */
export type CellRef = { staff_id: string; date: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 通知の本文用「9/3・9/4 ほか2日」 */
function datesLabel(dates: string[]): string {
  const sorted = [...dates].sort();
  const head = sorted.slice(0, 3).map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`).join("・");
  return sorted.length > 3 ? `${head} ほか${sorted.length - 3}日` : head;
}

function groupByStaff(cells: CellRef[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of cells) {
    if (!c?.staff_id || !DATE_RE.test(c?.date ?? "")) continue;
    const a = m.get(c.staff_id) ?? [];
    if (!a.includes(c.date)) a.push(c.date);
    m.set(c.staff_id, a);
  }
  return m;
}

async function notifyStaff(
  companyId: string,
  perStaff: Map<string, string[]>,
  make: (label: string) => { kind: string; title: string; body: string },
): Promise<void> {
  const rows = [...perStaff.entries()].filter(([, dates]) => dates.length).map(([staffId, dates]) => {
    const n = make(datesLabel(dates));
    return { company_id: companyId, staff_id: staffId, kind: n.kind, title: n.title, body: n.body, link: "/shifts" };
  });
  if (rows.length) await createAdmin().from("notifications").insert(rows);
}

/**
 * シフトの保存（グリッドの編集ぶんを反映）。
 *
 * 【#138】確定(published)済みのマスを編集しても確定のまま更新する。
 * 「直したら勝手に未確定へ戻っていた」＝スタッフの画面から消える、を起こさないため。
 * 代わりに、確定済みを書き換えたときは本人に変更通知を出す（黙って変えない）。
 */
export async function saveShifts(storeId: string, cells: CellShift[]): Promise<{ error?: string; changedPublished?: number }> {
  const actor = await requireActor("create_shifts");
  // storeId はクライアント引数＝改竄できる。他店のシフトを書き換えられないよう必ず検証（#134）
  await assertStoreAccess(actor, storeId);
  const admin = createAdmin();

  const staffIds = [...new Set(cells.map((c) => c.staff_id))];
  const dates = [...new Set(cells.map((c) => c.date))];
  if (!staffIds.length || !dates.length) return {};

  const [{ data: templates }, { data: existingRows }] = await Promise.all([
    admin.from("shift_templates").select("id, start_time, end_time, is_day_off").eq("company_id", actor.companyId),
    admin.from("shifts").select("staff_id, date, status, published_at, template_id, start_time, end_time, is_day_off")
      .eq("company_id", actor.companyId).eq("store_id", storeId)
      .in("staff_id", staffIds).in("date", dates).is("deleted_at", null),
  ]);
  const tmap = new Map((templates ?? []).map((t) => [t.id, t]));
  const emap = new Map((existingRows ?? []).map((s) => [`${s.staff_id}|${s.date}`, s]));

  const changed = new Map<string, string[]>();   // 確定済みを書き換えた staff → 日付

  for (const c of cells) {
    const prev = emap.get(`${c.staff_id}|${c.date}`);

    // テンプレも任意時刻も無い → クリア（draftのみ削除。published は解除しない＝確定解除ボタンで明示的に）
    if (!c.template_id && !(c.start_time && c.end_time)) {
      await admin.from("shifts").delete()
        .eq("staff_id", c.staff_id).eq("store_id", storeId).eq("date", c.date).eq("status", "draft");
      continue;
    }

    let start_time: string | null, end_time: string | null, is_day_off: boolean;
    if (c.template_id) {
      const t = tmap.get(c.template_id);
      if (!t) continue;
      start_time = t.start_time; end_time = t.end_time; is_day_off = t.is_day_off;
    } else {
      start_time = c.start_time ?? null; end_time = c.end_time ?? null; is_day_off = false;
    }

    const keepPublished = prev?.status === "published";
    const { error } = await admin.from("shifts").upsert(
      {
        company_id: actor.companyId,
        staff_id: c.staff_id,
        store_id: storeId,
        date: c.date,
        template_id: c.template_id,
        start_time,
        end_time,
        is_day_off,
        status: keepPublished ? "published" : "draft",
        published_at: keepPublished ? prev?.published_at ?? new Date().toISOString() : null,
        deleted_at: null,
      },
      { onConflict: "staff_id,store_id,date" }
    );
    if (error) return { error: error.message };

    if (keepPublished) {
      const same = (prev?.start_time ?? null) === start_time
        && (prev?.end_time ?? null) === end_time
        && (prev?.template_id ?? null) === (c.template_id ?? null)
        && prev?.is_day_off === is_day_off;
      if (!same) {
        const a = changed.get(c.staff_id) ?? [];
        a.push(c.date);
        changed.set(c.staff_id, a);
      }
    }
  }

  await notifyStaff(actor.companyId, changed, (label) => ({
    kind: "shift_changed",
    title: "確定済みシフトが変更されました",
    body: `${label} の内容が変わりました。シフト画面で確認してください。`,
  }));

  const changedCount = [...changed.values()].reduce((n, a) => n + a.length, 0);
  await logAudit(actor, "shifts.save", "shifts", null, null, { storeId, count: cells.length, changedPublished: changedCount });
  revalidatePath("/admin/shifts");
  return { changedPublished: changedCount };
}

/** 対象期間（半月/月など表示中の範囲）のドラフトをまとめて確定し、スタッフへ通知 */
export async function publishShifts(storeId: string, from: string, to: string): Promise<{ error?: string; published?: number }> {
  const actor = await requireActor("create_shifts");
  // 他店のドラフトを勝手に確定＆通知できないよう検証（#134）
  await assertStoreAccess(actor, storeId);
  const admin = createAdmin();

  const { data: drafts } = await admin.from("shifts")
    .select("id, staff_id")
    .eq("company_id", actor.companyId).eq("store_id", storeId)
    .eq("status", "draft").is("deleted_at", null)
    .gte("date", from).lte("date", to);

  if (!drafts?.length) return { error: "確定対象のドラフトがありません" };

  const { error } = await admin.from("shifts")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("company_id", actor.companyId).eq("store_id", storeId)
    .eq("status", "draft").gte("date", from).lte("date", to);
  if (error) return { error: error.message };

  // スタッフへ通知
  const staffIds = [...new Set(drafts.map((d) => d.staff_id))];
  const [y, m] = from.split("-");
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const rangeLabel = sameMonth
    ? `${y}年${Number(m)}月`
    : `${Number(from.slice(5, 7))}/${Number(from.slice(8))}〜${Number(to.slice(5, 7))}/${Number(to.slice(8))}`;
  await admin.from("notifications").insert(
    staffIds.map((sid) => ({
      company_id: actor.companyId,
      staff_id: sid,
      kind: "shift_published",
      title: `${rangeLabel}のシフトが確定しました`,
      body: "シフト画面から確認してください。",
      link: "/shifts",
    }))
  );

  await logAudit(actor, "shifts.publish", "shifts", null, null, { storeId, from, to, count: drafts.length });
  revalidatePath("/admin/shifts");
  return { published: drafts.length };
}

/**
 * 1マス単位の確定（#138）。
 * 「この人のこの日だけ先に確定したい」「あとから1日だけ足した」に対応する。
 */
export async function publishCells(storeId: string, cells: CellRef[]): Promise<{ error?: string; published?: number }> {
  const actor = await requireActor("create_shifts");
  await assertStoreAccess(actor, storeId);
  const admin = createAdmin();

  const byStaff = groupByStaff(cells);
  if (!byStaff.size) return { error: "確定する対象がありません" };

  const done = new Map<string, string[]>();
  for (const [staffId, dates] of byStaff) {
    const { data, error } = await admin.from("shifts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("company_id", actor.companyId).eq("store_id", storeId)
      .eq("staff_id", staffId).in("date", dates)
      .eq("status", "draft").is("deleted_at", null)
      .select("date");
    if (error) return { error: error.message };
    if (data?.length) done.set(staffId, data.map((r) => r.date));
  }

  const count = [...done.values()].reduce((n, a) => n + a.length, 0);
  if (!count) return { error: "確定できるドラフトがありませんでした（すでに確定済みかもしれません）" };

  await notifyStaff(actor.companyId, done, (label) => ({
    kind: "shift_published",
    title: `${label} のシフトが確定しました`,
    body: "シフト画面から確認してください。",
  }));

  await logAudit(actor, "shifts.publish_cells", "shifts", null, null, { storeId, count });
  revalidatePath("/admin/shifts");
  return { published: count };
}

/**
 * 1マス単位の確定解除（#138）。
 * 確定後に「やっぱりここを直したい」が必ず起きる。直せないと紙やLINEで運用が二重化する。
 * 解除するとスタッフの画面から消えるので、黙って消さずに本人へ知らせる。
 */
export async function unpublishCells(storeId: string, cells: CellRef[]): Promise<{ error?: string; reverted?: number }> {
  const actor = await requireActor("create_shifts");
  await assertStoreAccess(actor, storeId);
  const admin = createAdmin();

  const byStaff = groupByStaff(cells);
  if (!byStaff.size) return { error: "解除する対象がありません" };

  const done = new Map<string, string[]>();
  for (const [staffId, dates] of byStaff) {
    const { data, error } = await admin.from("shifts")
      .update({ status: "draft", published_at: null })
      .eq("company_id", actor.companyId).eq("store_id", storeId)
      .eq("staff_id", staffId).in("date", dates)
      .eq("status", "published").is("deleted_at", null)
      .select("date");
    if (error) return { error: error.message };
    if (data?.length) done.set(staffId, data.map((r) => r.date));
  }

  const count = [...done.values()].reduce((n, a) => n + a.length, 0);
  if (!count) return { error: "確定済みのシフトがありませんでした" };

  await notifyStaff(actor.companyId, done, (label) => ({
    kind: "shift_unpublished",
    title: `${label} のシフトを調整中です`,
    body: "いったん確定前に戻しました。決まりしだい改めてお知らせします。",
  }));

  await logAudit(actor, "shifts.unpublish_cells", "shifts", null, null, { storeId, count });
  revalidatePath("/admin/shifts");
  return { reverted: count };
}
