"use server";

import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { callAi, extractJson, hasAiKey, resolveProvider, type AiProvider } from "@/lib/ai";
import { findSimilarComments, loadStudentNotes } from "@/lib/data";
import { loadStyle, styleLines } from "@/lib/method";

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
  structured: string; // 整形した指導記録（問題点→修正点→ドリル）※しっかりした分量
  natural: string; // 自然な話し言葉の短文コメント（そのまま貼れる・2〜3文）
  engine: AiProvider | "template";
  examplesUsed: number;
};

/** 自然文の目安の長さ（短く・簡潔に。ここだけ変えれば全体に効く） */
const NATURAL_MAX_CHARS = 120;

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
  // 自然文は「今日の状態 → 次に意識すること」の2文だけに絞る
  const natural =
    `今日は${input.cause}が出ていました。` +
    `${input.fix}を意識していきましょう。` +
    (input.drill ? `${input.drill}で感覚を作っていきます。` : "");
  return { structured, natural };
}

/**
 * 自然文の長さの安全弁。AIが長く書いてしまっても、文の切れ目で丸めて短く保つ。
 * （プロンプトだけに任せず、コード側でも必ず短くなるようにしておく）
 */
function trimNatural(text: string): string {
  const t = (text ?? "").replace(/\s*\n+\s*/g, " ").trim();
  if (t.length <= NATURAL_MAX_CHARS) return t;
  const sentences = t.split(/(?<=[。！？])/);
  let out = "";
  for (const s of sentences) {
    if (out && (out + s).length > NATURAL_MAX_CHARS) break;
    out += s;
  }
  return (out || t.slice(0, NATURAL_MAX_CHARS)).trim();
}

/**
 * その学校の文体でレッスンコメントを下書き（過去コメントをお手本に）。
 * 2種類を返す: 整形した指導記録（詳しい） と 自然な話し言葉の短いひとこと。
 * AIキー（Claude / Gemini のどちらか）があればAI、無ければテンプレ。
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

  if (!hasAiKey()) {
    return { ...templateDraft(input), engine: "template", examplesUsed: examples.length };
  }

  // 店の文体プロファイル（sc_settings.style）。語彙・ドリル名はデータ駆動＝店ごとに変わる
  const style = await loadStyle(actor.companyId);
  const styleBlock = styleLines(style);

  const system =
    "あなたはこのゴルフスクールのベテランレッスンコーチで、実際のレッスンカルテを書きます。" +
    "提供される『過去コメント例』と『この店の言葉』の文体・語彙・ドリル名・言い回し・詳しさを必ず踏襲してください（この店らしさが最重要）。" +
    "薄い一般論で終わらせず、過去コメント例や『この店の言葉』に実際に出てくる具体語・ドリル名を使う。この店の資料に出てこない他校の用語やドリル名を持ち込まない。" +
    "医学的・断定的な表現は避け、生徒を前向きにする表現にします。" +
    "structured と natural は長さの方針がまったく違います。structured は詳しく、natural は短く。これを必ず守ること。" +
    "出力は必ず次のJSONのみ（前置き・説明・コードフェンス禁止）: " +
    '{"structured":"指導記録。問題点（スイングの局面ごとに具体的に）→改善策（体の使い方を具体的に）→ドリル（この学校のドリル名を2〜3個）→次回の意識、を見出し付きでしっかりした分量（目安150〜300字）で書く",' +
    `"natural":"生徒にそのまま送る短いひとことコメント。2〜3文・${NATURAL_MAX_CHARS}字以内。` +
    "『今日の状態』と『次に意識すること』だけに絞り、ドリル名は入れても1つまで。" +
    "前置き・あいさつ・まとめの一文（頑張りましょう等）は書かない。箇条書きにしない。structuredの要約ではなく、話し言葉の短い一言にする\"}";

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
    (styleBlock ? `\n--- この店の言葉（語彙・ドリル名・文体）---\n${styleBlock}\n` : "") +
    `\n--- この学校の過去コメント例（文体のお手本）---\n${exampleBlock}\n\n` +
    (studentContext ? "前回からの継続・変化にも一言触れつつ、" : "") +
    `JSONでstructured（詳しく）とnatural（${NATURAL_MAX_CHARS}字以内の短いひとこと）を書いてください。`;

  const provider = resolveProvider();
  const text = await callAi({ system, user, maxTokens: 1800, json: true });
  const parsed = text ? extractJson<{ structured?: string; natural?: string }>(text) : null;

  if (parsed?.structured && parsed?.natural) {
    return {
      structured: parsed.structured.trim(),
      natural: trimNatural(parsed.natural),
      engine: provider ?? "template",
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
