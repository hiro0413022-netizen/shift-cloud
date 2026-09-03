"use server";

import { revalidatePath } from "next/cache";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PROMOTE_HITS } from "@/lib/candidates";

/**
 * ナレッジの提案（音声メモから育った候補を、人が1タップで採用する）/ 2026-09-03
 *
 * ⚠ ここが **ナレッジ本体に書く唯一の入口**。
 *    録音の要約（api/voice-note/summarize）は候補を溜めるだけで、本体には触らない。
 *    自動採用は入れない（docs/modules/swing-cortex/VOICE_NOTE.md §4）。
 *
 * 採用したものは source='learned'。既存の manual / ai / seed / import と混ぜないので、
 * あとから「AIが育てた知識 n件」を数えられる。
 */

export type CandidateItem = {
  id: string;
  kind: "append" | "new_symptom";
  title: string;
  symptomName: string | null;
  checkpointTitle: string | null;
  proposed: { name?: string; title: string; cause: string; fix: string; drill: string | null; client: string | null };
  quote: string | null;
  hits: number;
  firstSeenOn: string;
  lastSeenOn: string;
};

export type CandidateBoard = {
  queued: CandidateItem[];
  /** まだ門を越えていない候補の数（「溜まっているが出していない」ことを見せる） */
  collecting: number;
  /** 見送った候補の数。回数は数え続けている */
  rejected: number;
  learnedCount: number;
  promoteHits: number;
  categories: string[];
};

type Row = {
  id: string; kind: "append" | "new_symptom"; title: string; proposed: CandidateItem["proposed"];
  quote: string | null; hits: number; first_seen_on: string; last_seen_on: string;
  symptom_id: string | null; checkpoint_id: string | null;
  sc_symptoms: { name: string } | { name: string }[] | null;
  sc_checkpoints: { title: string } | { title: string }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** 設定画面に出す一式 */
export async function loadCandidateBoard(): Promise<CandidateBoard> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const [{ data: q }, { count: collecting }, { count: rejected }, { count: learned }, { data: cats }] = await Promise.all([
    admin
      .from("sc_knowledge_candidates")
      // sc_symptoms へのFKが symptom_id と adopted_symptom_id の2本あるので、
      // どちらで結ぶかを明示する（省略すると PostgREST が PGRST201 で落ちる）
      .select(
        "id, kind, title, proposed, quote, hits, first_seen_on, last_seen_on, symptom_id, checkpoint_id, sc_symptoms!sc_knowledge_candidates_symptom_id_fkey(name), sc_checkpoints(title)"
      )
      .eq("company_id", actor.companyId)
      .eq("status", "queued")
      .order("hits", { ascending: false })
      .limit(20),
    admin.from("sc_knowledge_candidates").select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId).eq("status", "collected"),
    admin.from("sc_knowledge_candidates").select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId).eq("status", "rejected"),
    admin.from("sc_knowledge").select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId).eq("source", "learned").is("deleted_at", null),
    admin.from("sc_symptoms").select("category").eq("company_id", actor.companyId).is("deleted_at", null),
  ]);

  const categories = [...new Set(((cats ?? []) as { category: string }[]).map((c) => c.category).filter(Boolean))];

  return {
    queued: ((q ?? []) as unknown as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      symptomName: one(r.sc_symptoms)?.name ?? null,
      checkpointTitle: one(r.sc_checkpoints)?.title ?? null,
      proposed: r.proposed,
      quote: r.quote,
      hits: r.hits,
      firstSeenOn: r.first_seen_on,
      lastSeenOn: r.last_seen_on,
    })),
    collecting: collecting ?? 0,
    rejected: rejected ?? 0,
    learnedCount: learned ?? 0,
    promoteHits: PROMOTE_HITS,
    categories,
  };
}

export type AdoptInput = {
  id: string;
  title: string;
  cause: string;
  fix: string;
  drill: string;
  client: string;
  /** kind='new_symptom' のときだけ使う */
  name?: string;
  category?: string;
};

/** 採用する（ここでだけナレッジ本体に書く） */
export async function adoptCandidate(input: AdoptInput): Promise<{ error?: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();

  const { data } = await admin
    .from("sc_knowledge_candidates")
    .select("id, company_id, kind, symptom_id, checkpoint_id, status")
    .eq("id", input.id)
    .maybeSingle();
  const cand = data as
    | { id: string; company_id: string; kind: "append" | "new_symptom"; symptom_id: string | null; checkpoint_id: string | null; status: string }
    | null;
  if (!cand || cand.company_id !== actor.companyId) return { error: "候補が見つかりません" };
  if (cand.status === "adopted") return { error: "すでに採用済みです" };

  const title = input.title.trim();
  const cause = input.cause.trim();
  const fix = input.fix.trim();
  if (!title || !fix) return { error: "見出しと対処は必須です" };
  const drill = input.drill.trim() || null;
  const client = input.client.trim();

  let symptomId = cand.symptom_id;
  let checkpointId = cand.checkpoint_id;
  let knowledgeId: string | null = null;

  // 1) 新しい症状として採用する
  if (cand.kind === "new_symptom") {
    const name = (input.name ?? title).trim();
    const category = (input.category ?? "").trim() || "記録から追加";
    const { data: maxRow } = await admin
      .from("sc_symptoms")
      .select("sort_order")
      .eq("company_id", actor.companyId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
    const { data: s, error } = await admin
      .from("sc_symptoms")
      .insert({
        company_id: actor.companyId,
        category,
        name,
        tags: [],
        sort_order: nextOrder,
        active: true,
        source: "learned",
      })
      .select("id")
      .single();
    if (error || !s) return { error: "症状を作れませんでした" };
    symptomId = (s as { id: string }).id;
    checkpointId = null;
  }

  if (!symptomId) return { error: "寄せ先の症状がありません" };

  // 2) 既存の確認項目に足す（本文は消さずに継ぎ足す）
  if (checkpointId) {
    const { data: k } = await admin
      .from("sc_knowledge")
      .select("id, cause, fix, drill, client_explanation")
      .eq("company_id", actor.companyId)
      .eq("checkpoint_id", checkpointId)
      .is("deleted_at", null)
      .maybeSingle();
    const cur = k as { id: string; cause: string; fix: string; drill: string | null; client_explanation: string } | null;
    if (cur) {
      // すでに同じ趣旨が書いてあるなら足さない（同じ文が何度も並ぶのを防ぐ）
      const join = (a: string | null, b: string) => {
        const base = (a ?? "").trim();
        if (!b) return base || null;
        if (base.includes(b)) return base;
        return base ? `${base}／${b}` : b;
      };
      const { error } = await admin
        .from("sc_knowledge")
        .update({
          fix: join(cur.fix, fix) ?? cur.fix,
          drill: drill ? join(cur.drill, drill) : cur.drill,
          cause: cause ? join(cur.cause, cause) ?? cur.cause : cur.cause,
          source: "learned",
        })
        .eq("id", cur.id);
      if (error) return { error: "知識の更新に失敗しました" };
      knowledgeId = cur.id;
    } else {
      checkpointId = null; // 知識が無い確認項目だった＝新しく作る
    }
  }

  // 3) 確認項目ごと新しく作る（既存の症状の下 or 新しい症状の下）
  if (!checkpointId) {
    const { data: maxCp } = await admin
      .from("sc_checkpoints")
      .select("priority")
      .eq("company_id", actor.companyId)
      .eq("symptom_id", symptomId)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();
    const priority = ((maxCp as { priority?: number } | null)?.priority ?? 0) + 1;
    const { data: cp, error: cpErr } = await admin
      .from("sc_checkpoints")
      .insert({ company_id: actor.companyId, symptom_id: symptomId, priority, title })
      .select("id")
      .single();
    if (cpErr || !cp) return { error: "確認項目を作れませんでした" };
    checkpointId = (cp as { id: string }).id;

    const { data: kn, error: knErr } = await admin
      .from("sc_knowledge")
      .insert({
        company_id: actor.companyId,
        checkpoint_id: checkpointId,
        cause: cause || title,
        fix,
        drill,
        client_explanation: client || fix,
        source: "learned",
      })
      .select("id")
      .single();
    if (knErr || !kn) return { error: "知識を作れませんでした" };
    knowledgeId = (kn as { id: string }).id;
  }

  await admin
    .from("sc_knowledge_candidates")
    .update({
      status: "adopted",
      adopted_symptom_id: symptomId,
      adopted_knowledge_id: knowledgeId,
      decided_by: actor.staffId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", cand.id);

  revalidatePath("/settings");
  revalidatePath("/library");
  revalidatePath("/");
  return {};
}

/**
 * 見送る。**行は消さない**。
 * 同じ趣旨がまた出れば hits は増え続けるので、
 * 「5回出ているのに採用していない」が後から見える。
 */
export async function rejectCandidate(id: string): Promise<{ error?: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { error } = await admin
    .from("sc_knowledge_candidates")
    .update({ status: "rejected", decided_by: actor.staffId, decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: "更新に失敗しました" };
  revalidatePath("/settings");
  return {};
}
