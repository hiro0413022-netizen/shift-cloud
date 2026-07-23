"use server";

import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { callClaude, extractJson, hasClaudeKey } from "@/lib/ai";
import { findSimilarComments, loadStudentNotes } from "@/lib/data";

export type DraftInput = {
  symptomId: string;
  symptomName: string;
  category: string;
  checkpointTitle: string;
  cause: string;
  fix: string;
  drill?: string | null;
  client: string;
  coachMemo?: string | null;
  symptomKey?: string | null;
  tags?: string[] | null;
  studentRef?: string | null;
  studentId?: string | null;
};

export type DraftResult = {
  structured: string; // 整形した指導記録（問題点→修正点→ドリル）
  natural: string; // 自然な話し言葉の文章コメント（どこにでも貼れる）
  engine: "claude" | "template";
  examplesUsed: number;
};

/** キー無し・AI失敗時の決定的テンプレ（必ずコメントは出る） */
function templateDraft(input: DraftInput): { structured: string; natural: string } {
  const memo = (input.coachMemo ?? "").trim();
  const drill = input.drill ? `\nドリル: ${input.drill}` : "";
  const structured =
    `【${input.symptomName} / ${input.checkpointTitle}】\n` +
    `問題点: ${input.cause}\n` +
    (memo ? `所見: ${memo}\n` : "") +
    `改善策: ${input.fix}${drill}` +
    `\n次回: 上記のポイントを反復し、体の使い方の定着を確認していきましょう。`;
  const natural =
    `本日は${input.cause}という状態でした。${memo ? memo + " " : ""}` +
    `改善のポイントとして、${input.fix}を意識していきましょう。` +
    (input.drill ? `${input.drill}で正しい動きの感覚を作っていくと、少しずつ安定してきます。` : "") +
    `焦らず、一つずつ丁寧に取り組んでいきましょう。`;
  return { structured, natural };
}

/**
 * その学校の文体でレッスンコメントを下書き（過去コメントをお手本に）。
 * 2種類を返す: 整形した指導記録 と 自然な話し言葉の文章。
 * ANTHROPIC_API_KEY があればClaude、無ければテンプレ。
 */
export async function draftComment(input: DraftInput): Promise<DraftResult> {
  const actor = await requireCoachActor();

  const examples = await findSimilarComments(actor.companyId, {
    symptomKey: input.symptomKey ?? input.symptomName,
    keywords: [input.symptomName, ...(input.tags ?? [])],
    studentRef: input.studentRef,
    limit: 6,
  });

  // 生徒が選ばれていれば、その生徒の過去カルテを文脈に（前回の課題を踏まえる＝パーソナライズ）
  let studentContext = "";
  if (input.studentId) {
    const notes = await loadStudentNotes(actor.companyId, input.studentId);
    if (notes.length) {
      studentContext = notes
        .slice(0, 3)
        .map((n, i) => `前回${i + 1}（${n.symptomName ?? ""}）: ${n.natural ?? n.structured ?? ""}`)
        .join("\n");
    }
  }

  if (!hasClaudeKey()) {
    return { ...templateDraft(input), engine: "template", examplesUsed: examples.length };
  }

  const system =
    "あなたはこのゴルフスクールのベテランレッスンコーチで、実際のレッスンカルテを書きます。" +
    "提供される『過去コメント例』の文体・語彙・ドリル名・言い回し・詳しさを必ず踏襲してください（この学校らしさが最重要）。" +
    "過去コメント例と同じくらい具体的で詳しく書くこと。スイングのどの局面で何が起きているか（テイクバック・トップ・切り返し・ダウン・インパクト・フォロー）を具体的に描写し、原因→改善策→複数のドリル→次回への意識、まで踏み込む。" +
    "薄い一般論で終わらせず、過去コメント例に出てくる具体語（三角形同調・下半身先行・股関節・重心移動・前傾キープ・正面インパクト・コンパクトなトップ・縦振り 等）とドリル名（gooドリル・足踏み・ベタ足・ショルダーターン・両手クロス・ウェイトシフト 等）を実際に使う。" +
    "医学的・断定的な表現は避け、生徒を前向きにする表現にします。" +
    "出力は必ず次のJSONのみ: " +
    '{"structured":"指導記録。問題点（スイングの局面ごとに具体的に）→改善策（体の使い方を具体的に）→ドリル（この学校のドリル名を2〜3個）→次回の意識、を見出し付きでしっかりした分量（目安150〜300字）で書く",' +
    '"natural":"同じ内容を、この学校のコーチが実際に書くような自然な文章コメントで、過去コメント例と同等の詳しさ（目安150〜300字）。箇条書きにせず、問題点・改善策・ドリルまで文章で具体的に書く"}';

  const exampleBlock = examples.length
    ? examples.map((e, i) => `例${i + 1}: ${e}`).join("\n")
    : "（過去コメント例なし。一般的なレッスンコメントの体裁で）";

  const user =
    `症状: ${input.symptomName}（${input.category}）\n` +
    `確認ポイント: ${input.checkpointTitle}\n` +
    `原因: ${input.cause}\n` +
    `対処: ${input.fix}\n` +
    (input.drill ? `ドリル: ${input.drill}\n` : "") +
    (input.coachMemo ? `今日のコーチ所見（口語・箇条書き可）: ${input.coachMemo}\n` : "") +
    (studentContext ? `\n--- この生徒の前回までのカルテ（継続性を意識）---\n${studentContext}\n` : "") +
    `\n--- この学校の過去コメント例（文体のお手本）---\n${exampleBlock}\n\n` +
    (studentContext ? "前回からの継続・変化にも一言触れつつ、" : "") +
    `JSONでstructuredとnaturalを書いてください。`;

  const text = await callClaude({ system, user, maxTokens: 1800 });
  const parsed = text ? extractJson<{ structured?: string; natural?: string }>(text) : null;

  if (parsed?.structured && parsed?.natural) {
    return {
      structured: parsed.structured.trim(),
      natural: parsed.natural.trim(),
      engine: "claude",
      examplesUsed: examples.length,
    };
  }
  // AIが失敗してもコメントは必ず返す
  return { ...templateDraft(input), engine: "template", examplesUsed: examples.length };
}

/** 下書きを診断ログ（sc_diagnoses）に保存。カルテ全面連携(lsn_comments)はP3。 */
export async function saveKarteDraft(input: {
  symptomId: string;
  symptomName: string;
  studentRef?: string | null;
  coachMemo?: string | null;
  structured: string;
  natural: string;
}): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin.from("sc_diagnoses").insert({
    company_id: actor.companyId,
    coach_staff_id: actor.staffId,
    symptom_id: input.symptomId,
    student_ref: input.studentRef ?? null,
    input_text: input.coachMemo ?? null,
    sent_line: false,
    result_json: { symptom: input.symptomName, structured: input.structured, natural: input.natural },
  });
  return { ok: true };
}
