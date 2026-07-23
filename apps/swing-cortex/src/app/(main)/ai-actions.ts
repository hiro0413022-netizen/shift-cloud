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
    `修正点: ${input.fix}${drill}` +
    (memo ? `\n所見: ${memo}` : "") +
    `\n次回: 上記を反復し定着を確認。`;
  const natural =
    `本日は${input.cause}という状態でした。${input.fix}を意識していきましょう。` +
    (input.drill ? `${input.drill}で感覚を作っていくと、少しずつ改善していきます。` : "");
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
    "あなたはこのゴルフスクールのベテランレッスンコーチです。" +
    "提供される『過去コメント例』の文体・語彙・ドリル名・言い回しを必ず踏襲してください（この学校らしさが最重要）。" +
    "医学的・断定的な表現は避け、生徒を前向きにする表現にします。" +
    "出力は必ず次のJSONのみ: " +
    '{"structured":"問題点→修正点→ドリルを簡潔に整えた指導記録（見出し付き・箇条書き可）",' +
    '"natural":"同じ内容を、この学校のコーチが書くような自然な話し言葉の文章コメント。箇条書きにせず数文の文章で。カルテにもメッセージにもそのまま使える汎用的な文体"}';

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

  const text = await callClaude({ system, user, maxTokens: 1100 });
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
