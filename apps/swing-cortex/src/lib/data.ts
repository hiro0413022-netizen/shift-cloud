import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { DiagnosisResult } from "@/lib/coaching";

/**
 * 会社スコープでデータ取得（service_role[admin]でRLSバイパス、company_idで明示フィルタ）。
 * 独立アプリの勝ちパターン（lesson-os / member-os 同型）。
 */

type Row = {
  id: string;
  name: string;
  category: string;
  flight_dir: string | null;
  tags: string[] | null;
  sort_order: number;
  sc_checkpoints: {
    priority: number;
    title: string;
    sc_knowledge: {
      cause: string;
      fix: string;
      drill: string | null;
      client_explanation: string;
    }[];
  }[];
};

/** 症状ツリー（症状→確認項目→知識）を優先度順に整形して返す */
export async function loadSymptomTree(companyId: string): Promise<DiagnosisResult[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_symptoms")
    .select(
      "id, name, category, flight_dir, tags, sort_order, sc_checkpoints(priority, title, sc_knowledge(cause, fix, drill, client_explanation))"
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({
    symptomId: r.id,
    symptomName: r.name,
    category: r.category,
    tags: r.tags ?? [],
    flightDir: r.flight_dir,
    checkpoints: [...(r.sc_checkpoints ?? [])]
      .sort((a, b) => a.priority - b.priority)
      .map((cp) => {
        const k = cp.sc_knowledge?.[0];
        return {
          priority: cp.priority,
          title: cp.title,
          cause: k?.cause ?? "",
          fix: k?.fix ?? "",
          drill: k?.drill ?? null,
          client: k?.client_explanation ?? "",
        };
      }),
  }));
}

export type ManageCheckpoint = {
  id: string;
  knowledgeId: string | null;
  priority: number;
  title: string;
  cause: string;
  fix: string;
  drill: string;
  client: string;
};
export type ManageSymptom = {
  id: string;
  category: string;
  name: string;
  tags: string[];
  flightDir: string | null;
  sortOrder: number;
  active: boolean;
  checkpoints: ManageCheckpoint[];
};

/** 編集用ツリー（各IDを含む・優先度順）。/manage の編集画面が使う。 */
export async function loadManageTree(companyId: string): Promise<ManageSymptom[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_symptoms")
    .select(
      "id, category, name, tags, flight_dir, sort_order, active, sc_checkpoints(id, priority, title, sc_knowledge(id, cause, fix, drill, client_explanation))"
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  type Row = {
    id: string;
    category: string;
    name: string;
    tags: string[] | null;
    flight_dir: string | null;
    sort_order: number;
    active: boolean;
    sc_checkpoints: {
      id: string;
      priority: number;
      title: string;
      sc_knowledge: { id: string; cause: string; fix: string; drill: string | null; client_explanation: string }[];
    }[];
  };
  const rows = (data ?? []) as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    tags: r.tags ?? [],
    flightDir: r.flight_dir,
    sortOrder: r.sort_order,
    active: r.active,
    checkpoints: [...(r.sc_checkpoints ?? [])]
      .sort((a, b) => a.priority - b.priority)
      .map((cp) => {
        const k = cp.sc_knowledge?.[0];
        return {
          id: cp.id,
          knowledgeId: k?.id ?? null,
          priority: cp.priority,
          title: cp.title,
          cause: k?.cause ?? "",
          fix: k?.fix ?? "",
          drill: k?.drill ?? "",
          client: k?.client_explanation ?? "",
        };
      }),
  }));
}

/** よく使う症状（sc_patternsの頻度上位のsymptom_key） */
export async function loadFrequentSymptoms(companyId: string): Promise<string[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_patterns")
    .select("symptom_key, freq")
    .eq("company_id", companyId)
    .order("freq", { ascending: false })
    .limit(50);
  const agg = new Map<string, number>();
  for (const r of (data ?? []) as { symptom_key: string; freq: number }[]) {
    if (r.symptom_key === "その他") continue;
    agg.set(r.symptom_key, (agg.get(r.symptom_key) ?? 0) + r.freq);
  }
  return [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
}

/**
 * 過去コメントから、この症状に近いものを取り出す（RAG-lite・埋め込みはP3）。
 * その学校の文体・ドリル名の“お手本”としてAIの下書きに与える。
 * 生徒refがあればその生徒のコメントを優先（継続性・パーソナライズ）。
 */
export async function findSimilarComments(
  companyId: string,
  opts: { symptomKey?: string | null; studentRef?: string | null; limit?: number }
): Promise<string[]> {
  const admin = createAdmin();
  const limit = opts.limit ?? 6;
  const out: string[] = [];

  if (opts.studentRef) {
    const { data } = await admin
      .from("sc_comments")
      .select("body")
      .eq("company_id", companyId)
      .eq("student_ref", opts.studentRef)
      .order("created_at", { ascending: false })
      .limit(3);
    for (const r of (data ?? []) as { body: string }[]) out.push(r.body);
  }

  if (opts.symptomKey) {
    const { data } = await admin
      .from("sc_comments")
      .select("body")
      .eq("company_id", companyId)
      .eq("symptom_key", opts.symptomKey)
      .limit(limit);
    for (const r of (data ?? []) as { body: string }[]) out.push(r.body);
  }

  // 重複除去 & 長さ整形
  const seen = new Set<string>();
  return out
    .filter((b) => b && !seen.has(b) && (seen.add(b), true))
    .map((b) => (b.length > 300 ? b.slice(0, 300) : b))
    .slice(0, limit);
}

export type Student = { id: string; name: string; nameKana: string | null; memberCode: string | null };

/** 生徒台帳（会社スコープ・名前順） */
export async function loadStudents(companyId: string): Promise<Student[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_students")
    .select("id, name, name_kana, member_code")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);
  return ((data ?? []) as { id: string; name: string; name_kana: string | null; member_code: string | null }[]).map(
    (r) => ({ id: r.id, name: r.name, nameKana: r.name_kana, memberCode: r.member_code })
  );
}

export type StudentNote = {
  id: string;
  symptomName: string | null;
  coachMemo: string | null;
  structured: string | null;
  natural: string | null;
  createdAt: string;
};

/** ある生徒の保存カルテ（新しい順） */
export async function loadStudentNotes(companyId: string, studentId: string): Promise<StudentNote[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("sc_notes")
    .select("id, symptom_name, coach_memo, structured, natural_text, created_at")
    .eq("company_id", companyId)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    (data ?? []) as {
      id: string;
      symptom_name: string | null;
      coach_memo: string | null;
      structured: string | null;
      natural_text: string | null;
      created_at: string;
    }[]
  ).map((r) => ({
    id: r.id,
    symptomName: r.symptom_name,
    coachMemo: r.coach_memo,
    structured: r.structured,
    natural: r.natural_text,
    createdAt: r.created_at,
  }));
}

export type PhaseStat = { label: string; count: number };

/** 本部インサイト用の集計 */
export async function loadInsights(companyId: string) {
  const admin = createAdmin();
  const [{ count: commentCount }, { data: patterns }, { count: diagCount }] = await Promise.all([
    admin.from("sc_comments").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    admin.from("sc_patterns").select("phase, freq").eq("company_id", companyId),
    admin.from("sc_diagnoses").select("id", { count: "exact", head: true }).eq("company_id", companyId),
  ]);
  const phaseMap = new Map<string, number>();
  for (const p of (patterns ?? []) as { phase: string; freq: number }[]) {
    if (p.phase === "その他") continue;
    phaseMap.set(p.phase, (phaseMap.get(p.phase) ?? 0) + p.freq);
  }
  const phases: PhaseStat[] = [...phaseMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  return { commentCount: commentCount ?? 0, diagCount: diagCount ?? 0, phases };
}
