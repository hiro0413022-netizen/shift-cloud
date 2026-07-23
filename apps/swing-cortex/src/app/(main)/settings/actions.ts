"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { classifyPhases, guessSymptom, isNoise, aggregatePatterns } from "@/lib/coaching";

export type ImportResult = { ok: boolean; message: string; imported?: number; skipped?: number };

/** ヘッダ行を探し、必要な列インデックスを特定する */
function locateColumns(rows: unknown[][]) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    // sheet_to_json は空セルで疎配列（穴あき）を返すことがある。
    // .map は穴を残すため、Array.from で密な文字列配列に正規化する（undefined.includes 対策）。
    const raw = rows[i] ?? [];
    const row = Array.from({ length: raw.length }, (_, j) => String(raw[j] ?? "").trim());
    const commentIdx = row.findIndex((c) => c === "コメント");
    if (commentIdx >= 0) {
      const find = (names: string[]) => row.findIndex((c) => names.some((n) => c.includes(n)));
      return {
        headerRow: i,
        comment: commentIdx,
        coach: find(["講師", "コーチ"]),
        student: find(["顧客レコードID", "生徒", "顧客"]),
        course: find(["レッスンレコードID", "コース"]),
        extId: find(["レコードID"]),
      };
    }
  }
  return null;
}

/**
 * WING NOTE等のExcel（.xlsx）を取込 → 生コメントをsc_commentsへ、
 * ルール分類した局面×症状の頻度をsc_patternsへ加算（データフライホイールの起点）。
 * mode: "append"（追加）/ "replace"（全入れ替え）
 */
export async function importExcel(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const file = formData.get("file") as File | null;
  const mode = String(formData.get("mode") ?? "append");
  if (!file || file.size === 0) return { ok: false, message: "ファイルを選択してください" };
  if (file.size > 20 * 1024 * 1024) return { ok: false, message: "ファイルが大きすぎます（20MBまで）" };

  let rows: unknown[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
  } catch {
    return { ok: false, message: "Excelを読み込めませんでした（.xlsx形式か確認してください）" };
  }

  const col = locateColumns(rows);
  if (!col) return { ok: false, message: "「コメント」列が見つかりませんでした" };

  const dataRows = rows.slice(col.headerRow + 1);
  const cell = (r: unknown[], idx: number) => (idx >= 0 && r ? String(r[idx] ?? "").trim() : "");

  // 全入れ替え: 既存の取込コメントと集計を消去（この会社のみ）
  if (mode === "replace") {
    await admin.from("sc_comments").delete().eq("company_id", actor.companyId);
    await admin.from("sc_patterns").delete().eq("company_id", actor.companyId);
  }

  // 取込バッチ記録
  const { data: batch } = await admin
    .from("sc_import_batches")
    .insert({
      company_id: actor.companyId,
      source: "excel",
      filename: file.name,
      row_count: dataRows.length,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  const batchId = (batch as { id: string } | null)?.id ?? null;

  // 生コメント整形
  const bodies: string[] = [];
  const commentRows = dataRows
    .map((r) => {
      const body = cell(r, col.comment);
      if (!body || body === "« NULL »") return null;
      bodies.push(body);
      return {
        company_id: actor.companyId,
        batch_id: batchId,
        external_id: cell(r, col.extId) || null,
        coach_name: cell(r, col.coach) || null,
        student_ref: cell(r, col.student) || null,
        course: cell(r, col.course) || null,
        body,
        phases: classifyPhases(body),
        symptom_key: guessSymptom(body),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const skipped = commentRows.filter((c) => isNoise(c.body)).length;

  // 500件ずつinsert
  for (let i = 0; i < commentRows.length; i += 500) {
    const chunk = commentRows.slice(i, i + 500);
    const { error } = await admin.from("sc_comments").insert(chunk);
    if (error) return { ok: false, message: "コメント保存でエラー: " + error.message };
  }

  // 局面×症状の頻度を集計 → 既存に加算してupsert
  const counts = aggregatePatterns(bodies);
  const { data: existing } = await admin
    .from("sc_patterns")
    .select("phase, symptom_key, freq")
    .eq("company_id", actor.companyId);
  const cur = new Map<string, number>();
  for (const e of (existing ?? []) as { phase: string; symptom_key: string; freq: number }[]) {
    cur.set(`${e.phase}|||${e.symptom_key}`, e.freq);
  }
  const upserts = counts.map((c) => {
    const prev = cur.get(`${c.phase}|||${c.symptom_key}`) ?? 0;
    const freq = prev + c.freq;
    return {
      company_id: actor.companyId,
      phase: c.phase,
      symptom_key: c.symptom_key,
      freq,
      weight: freq,
      updated_at: new Date().toISOString(),
    };
  });
  for (let i = 0; i < upserts.length; i += 500) {
    const chunk = upserts.slice(i, i + 500);
    const { error } = await admin.from("sc_patterns").upsert(chunk, { onConflict: "company_id,phase,symptom_key" });
    if (error) return { ok: false, message: "集計保存でエラー: " + error.message };
  }

  revalidatePath("/");
  revalidatePath("/insights");
  return {
    ok: true,
    message: `取込完了：${commentRows.length}件を解析（ノイズ${skipped}件除外）。インサイトに反映しました。`,
    imported: commentRows.length,
    skipped,
  };
}
