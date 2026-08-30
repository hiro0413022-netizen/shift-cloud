/**
 * レッスンメモの症状タグ（AIカルテナレッジ）の共通整形。
 *
 * ⚠ ここは "use server" ファイルに置かない。
 *   actions.ts は Server Actions ファイルなので **async関数しかexportできない**。
 *   同期関数 mapNoteSymptom を actions.ts に置いたことで Next のビルドが
 *   「Server Actions must be async functions」で落ち、2026-08-28〜30 の2日間
 *   lesson-os のデプロイが全部失敗していた（tsc とテストでは検出できない）。
 */

export type NoteSymptom = {
  id: string;
  symptomId: string;
  symptom: string;
  category: string | null;
  checkpointId: string | null;
  checkpoint: string | null;
  quote: string | null;
  confidence: number;
  source: string;
  rejected: boolean;
};

/** page.tsx / actions.ts と共用（ネスト取得は配列型に推論されることがあるので両対応・#76と同種） */
export function mapNoteSymptom(r: unknown): NoteSymptom {
  const x = r as Record<string, unknown>;
  const s = Array.isArray(x.sc_symptoms) ? x.sc_symptoms[0] : x.sc_symptoms;
  const c = Array.isArray(x.sc_checkpoints) ? x.sc_checkpoints[0] : x.sc_checkpoints;
  return {
    id: String(x.id),
    symptomId: String(x.symptom_id),
    symptom: String((s as { name?: string } | null)?.name ?? "（不明な症状）"),
    category: ((s as { category?: string | null } | null)?.category) ?? null,
    checkpointId: (x.checkpoint_id as string | null) ?? null,
    checkpoint: ((c as { title?: string } | null)?.title) ?? null,
    quote: (x.quote as string | null) ?? null,
    confidence: Number(x.confidence ?? 0),
    source: String(x.source ?? "ai"),
    rejected: Boolean(x.rejected),
  };
}
