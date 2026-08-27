"use server";

import { revalidatePath } from "next/cache";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { callAi, extractJson, hasAiKey } from "@/lib/ai";
import { isNoise } from "@/lib/coaching";
import type { StoreStyle } from "@/lib/method";

/**
 * 店オリジナル・メソッド生成（このシステムの核心 / 2026-08-27 ユーザー方針）。
 *
 * 汎用の症状テンプレを配るのではなく、その店の実レッスンコメントから
 * 「その店の言葉遣い・ドリル名・指導の流れ」のまま症状ツリー
 * (sc_symptoms / sc_checkpoints / sc_knowledge, source='ai') を生成する。
 *
 * 手順（settings の MethodClient が直列に呼ぶ。1アクション=AI1呼び出しで
 * Vercel maxDuration=60 に収める）:
 *   1. analyzeStyle()         … 文体プロファイル → sc_settings.style
 *   2. discoverThemes()       … この店の指導テーマ（分類×検索語）を発見
 *   3. generateThemeSymptom() … テーマごとに症状+確認項目+知識を生成
 *   4. removeSeedMaster()     … 汎用シード(source='seed')を店メソッドへ置換
 */

export type MethodStatus = {
  comments: number;
  aiSymptoms: number;
  seedSymptoms: number;
  hasStyle: boolean;
  aiReady: boolean;
};

export type Theme = { name: string; category: string; keywords: string[] };

/** 新しい順に最大1000件読み、ノイズを除いて等間隔サンプリング */
async function sampleBodies(companyId: string, max: number): Promise<string[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_comments")
    .select("body")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const all = ((data ?? []) as { body: string }[])
    .map((r) => (r.body ?? "").trim())
    .filter((b) => !isNoise(b) && b.length >= 25);
  if (all.length <= max) return all;
  const step = all.length / max;
  const out: string[] = [];
  for (let i = 0; i < max; i++) out.push(all[Math.floor(i * step)]);
  return out;
}

export async function getMethodStatus(): Promise<MethodStatus> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const [c1, c2, c3, st] = await Promise.all([
    admin.from("sc_comments").select("id", { count: "exact", head: true }).eq("company_id", actor.companyId),
    admin
      .from("sc_symptoms")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .eq("source", "ai")
      .is("deleted_at", null),
    admin
      .from("sc_symptoms")
      .select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId)
      .eq("source", "seed")
      .is("deleted_at", null),
    admin.from("sc_settings").select("style").eq("company_id", actor.companyId).maybeSingle(),
  ]);
  return {
    comments: c1.count ?? 0,
    aiSymptoms: c2.count ?? 0,
    seedSymptoms: c3.count ?? 0,
    hasStyle: !!(st.data as { style?: unknown } | null)?.style,
    aiReady: hasAiKey(),
  };
}

/** 1. 文体プロファイル（語彙・ドリル名・定番フレーズ・文体）→ sc_settings.style */
export async function analyzeStyle(): Promise<{ ok: boolean; message: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const bodies = await sampleBodies(actor.companyId, 60);
  if (bodies.length < 10) return { ok: false, message: "コメントが少なすぎます（先にExcel取込をしてください）" };

  const system =
    "あなたはゴルフスクールのレッスンコメント分析の専門家です。" +
    "このスクールのコーチが実際に書いたコメントから、店の『言葉のプロファイル』を抽出します。" +
    "一般的なゴルフ用語の一覧を作るのではなく、このコメント群に実際に出てくる、この店らしい語だけを拾うこと。" +
    "出力は次のJSONのみ（前置き・コードフェンス禁止）: " +
    '{"vocab":["この店特有の技術用語・体の使い方の表現を10〜20個"],' +
    '"drills":["この店のドリル名・練習メニュー名を実際の呼び名のまま（最大10個・無ければ空配列）"],' +
    '"phrases":["コーチがよく使う定番の言い回しを3〜8個（原文のまま）"],' +
    '"tone":"文体の特徴を1文（語尾・語りかけ方・説明の順序など）"}';
  const user = "このスクールの実際のレッスンコメント:\n" + bodies.map((b, i) => `${i + 1}. ${b}`).join("\n");

  const text = await callAi({ system, user, maxTokens: 1500, json: true });
  const style = text ? extractJson<StoreStyle>(text) : null;
  if (!style || !style.vocab?.length) return { ok: false, message: "文体分析に失敗しました（もう一度お試しください）" };

  const { error } = await admin
    .from("sc_settings")
    .upsert({ company_id: actor.companyId, style }, { onConflict: "company_id" });
  if (error) return { ok: false, message: "保存に失敗: " + error.message };
  return {
    ok: true,
    message: `語彙${style.vocab.length}・ドリル${style.drills?.length ?? 0}・フレーズ${style.phrases?.length ?? 0}を保存`,
  };
}

/** 2. この店の指導テーマを発見（汎用分類を押し付けない） */
export async function discoverThemes(): Promise<{ ok: boolean; message: string; themes?: Theme[] }> {
  const actor = await requireCoachActor();
  const bodies = await sampleBodies(actor.companyId, 80);
  if (bodies.length < 10) return { ok: false, message: "コメントが少なすぎます" };

  const system =
    "あなたはゴルフスクールの指導メソッドを体系化する専門家です。" +
    "このスクールの実際のレッスンコメントから、この店が実際に教えている『指導テーマ』を8〜14個発見します。" +
    "汎用のゴルフ理論の分類（スライス・フック等）を押し付けず、コメントに実際に頻出する切り口" +
    "（スイング局面・姿勢エラー・この店独自のメソッド名など）でまとめること。" +
    "keywords は本文からそのテーマの実例を探す検索語（本文に実際に出てくる表記で3〜8個）。" +
    "出力は次のJSONのみ: " +
    '{"themes":[{"name":"テーマ名（この店の呼び方で）","category":"大分類（例: アドレス・構え／テイクバック〜トップ／切り返し〜ダウン／インパクト〜フィニッシュ／アプローチ・パター など実態に合わせる）","keywords":["検索語"]}]}';
  const user = "このスクールの実際のレッスンコメント:\n" + bodies.map((b, i) => `${i + 1}. ${b}`).join("\n");

  const text = await callAi({ system, user, maxTokens: 2000, json: true });
  const parsed = text ? extractJson<{ themes?: Theme[] }>(text) : null;
  const themes = (parsed?.themes ?? [])
    .filter((t) => t?.name && t?.category && (t.keywords?.length ?? 0) > 0)
    .slice(0, 16);
  if (!themes.length) return { ok: false, message: "テーマ発見に失敗しました（もう一度お試しください）" };
  return { ok: true, message: `${themes.length}テーマを発見`, themes };
}

/** 3. テーマ1つ → 症状+確認項目+知識（source='ai'）。この店の言い回しだけで作る */
export async function generateThemeSymptom(theme: Theme, sortOrder: number): Promise<{ ok: boolean; message: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();

  const kws = (theme.keywords ?? [])
    .map((k) => k.replace(/[%,()）（・/]/g, " ").trim())
    .filter((k) => k.length >= 2)
    .slice(0, 8);
  let bodies: string[] = [];
  if (kws.length) {
    const orExpr = kws.map((k) => `body.ilike.*${k}*`).join(",");
    const { data } = await admin
      .from("sc_comments")
      .select("body")
      .eq("company_id", actor.companyId)
      .or(orExpr)
      .order("created_at", { ascending: false })
      .limit(120);
    bodies = ((data ?? []) as { body: string }[])
      .map((r) => (r.body ?? "").trim())
      .filter((b) => !isNoise(b) && b.length >= 30);
  }
  if (bodies.length < 3) return { ok: false, message: `「${theme.name}」: 該当コメントが少なく見送りました` };
  const n = Math.min(30, bodies.length);
  const step = bodies.length / n;
  const sample: string[] = [];
  for (let i = 0; i < n; i++) sample.push(bodies[Math.floor(i * step)]);

  const system =
    "あなたはこのゴルフスクールのヘッドコーチです。実際のレッスンコメントから、このテーマの指導方法を構造化します。" +
    "最重要: 原因・改善・ドリル・生徒向け説明は、提供コメントに書かれている内容と言葉遣いだけから作ること。" +
    "このコメント群に出てこない一般ゴルフ理論・他校の用語・ドリル名を混ぜてはいけない。" +
    "言い回し（語尾・比喩・指示の順序）もコメントの文体をそのまま踏襲する。" +
    "出力は次のJSONのみ: " +
    '{"name":"症状・テーマ名（この店の呼び方）","tags":["生徒の訴えや見た目の言い換え4〜8個（本文の表現から）"],' +
    '"checkpoints":[{"title":"確認ポイント名","cause":"原因（この店の説明の仕方で）","fix":"改善・対処（この店の言い回しで具体的に）",' +
    '"drill":"この店のドリル・練習法（本文に無ければ空文字）","client":"生徒にそのまま送れる説明（この店の文体で2〜3文）"}]}' +
    " checkpointsは確認する優先度順に2〜3個。";
  const user =
    `テーマ: ${theme.name}（分類: ${theme.category}）\n\n` +
    "この店の実際のレッスンコメント（このテーマ関連）:\n" +
    sample.map((b, i) => `${i + 1}. ${b}`).join("\n");

  const text = await callAi({ system, user, maxTokens: 2000, json: true });
  type Parsed = {
    name?: string;
    tags?: string[];
    checkpoints?: { title?: string; cause?: string; fix?: string; drill?: string; client?: string }[];
  };
  const parsed = text ? extractJson<Parsed>(text) : null;
  const cps = (parsed?.checkpoints ?? []).filter((c) => c?.title && c?.cause && c?.fix).slice(0, 3);
  if (!parsed?.name || !cps.length) return { ok: false, message: `「${theme.name}」: 生成に失敗しました` };

  // 同名のAI生成分は入れ替え（再生成で増殖しない）
  const { data: olds } = await admin
    .from("sc_symptoms")
    .select("id")
    .eq("company_id", actor.companyId)
    .eq("source", "ai")
    .eq("name", parsed.name)
    .is("deleted_at", null);
  for (const o of (olds ?? []) as { id: string }[]) {
    await admin.from("sc_symptoms").update({ deleted_at: new Date().toISOString() }).eq("id", o.id);
  }

  const { data: sym, error: symErr } = await admin
    .from("sc_symptoms")
    .insert({
      company_id: actor.companyId,
      category: theme.category,
      name: parsed.name,
      tags: (parsed.tags ?? []).slice(0, 10),
      sort_order: sortOrder,
      active: true,
      source: "ai",
    })
    .select("id")
    .single();
  if (symErr || !sym) return { ok: false, message: `「${theme.name}」: 保存に失敗しました` };
  const symptomId = (sym as { id: string }).id;

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i];
    const { data: cpRow } = await admin
      .from("sc_checkpoints")
      .insert({ company_id: actor.companyId, symptom_id: symptomId, priority: i + 1, title: cp.title })
      .select("id")
      .single();
    if (!cpRow) continue;
    await admin.from("sc_knowledge").insert({
      company_id: actor.companyId,
      checkpoint_id: (cpRow as { id: string }).id,
      cause: cp.cause,
      fix: cp.fix,
      drill: cp.drill?.trim() ? cp.drill.trim() : null,
      client_explanation: cp.client ?? "",
      source: "ai",
    });
  }
  revalidatePath("/library");
  revalidatePath("/");
  return { ok: true, message: `「${parsed.name}」を生成（確認項目${cps.length}件）` };
}

/** 4. 汎用シードを店メソッドへ置き換え（店メソッドが十分あるときだけ） */
export async function removeSeedMaster(): Promise<{ ok: boolean; message: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const { count: aiCount } = await admin
    .from("sc_symptoms")
    .select("id", { count: "exact", head: true })
    .eq("company_id", actor.companyId)
    .eq("source", "ai")
    .is("deleted_at", null);
  if ((aiCount ?? 0) < 5) return { ok: false, message: "店メソッドがまだ少ないため、汎用テンプレは残しました" };
  const { data: seeds } = await admin
    .from("sc_symptoms")
    .select("id")
    .eq("company_id", actor.companyId)
    .eq("source", "seed")
    .is("deleted_at", null);
  const ids = ((seeds ?? []) as { id: string }[]).map((s) => s.id);
  if (ids.length) {
    await admin.from("sc_symptoms").update({ deleted_at: new Date().toISOString() }).in("id", ids);
  }
  revalidatePath("/library");
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, message: ids.length ? `汎用テンプレ${ids.length}件を店メソッドに置き換えました` : "汎用テンプレはありません（店メソッドのみ）" };
}
