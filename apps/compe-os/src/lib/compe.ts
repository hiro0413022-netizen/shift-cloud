import "server-only";
import { cache } from "react";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@yozan/core/auth";
import type { CompeFormat, ScoreInput } from "@yozan/core/compe-score";

/* ========== 型 ========== */

export type ReceptionField = {
  id: string;
  label: string;
  /** checkin/paid/time/notes は組み込み。check=チェック欄・text=自由記入 */
  type: "checkin" | "paid" | "time" | "notes" | "check" | "text";
  visible: boolean;
  builtin?: boolean;
};

export type SurveyQuestion = {
  id: string;
  type: "radio" | "checkbox" | "text";
  text: string;
  options: string[];
};

export type SheetCol = { id: string; label: string; fixed?: boolean };

/** 募集ページの追加設問（朝の練習会・懇親会など）。答えは custom_fields[id] に入る（#239） */
export type EntryQuestion = {
  id: string;
  label: string;
  options: string[];
  required?: boolean;
};

export type Comp = {
  id: string;
  company_id: string;
  store_id: string | null;
  name: string;
  held_on: string | null;
  venue: string | null;
  course: string | null;
  organizer: string | null;
  contact: string | null;
  fee: number;
  start_time: string | null;
  meet_time: string | null;
  format: CompeFormat;
  team_size: number;
  tee_options: string[];
  notes: string | null;
  ann_greeting: string | null;
  ann_closing: string | null;
  ann_group_title: string | null;
  ann_show_hcp: boolean;
  survey_title: string | null;
  survey_desc: string | null;
  survey_questions: SurveyQuestion[];
  reception_fields: ReceptionField[];
  sheet_cols: { personal?: SheetCol[]; team?: SheetCol[] };
  status: "planning" | "running" | "closed";
  /* 募集ページ（#233） */
  entry_slug: string | null;
  entry_open: boolean;
  entry_capacity: number | null;
  entry_opens_on: string | null;
  entry_closes_on: string | null;
  entry_note: string | null;
  entry_terms: string | null;
  entry_questions: EntryQuestion[];
  play_fee: number | null;
  created_at: string;
};

export type Participant = {
  id: string;
  comp_id: string;
  name: string;
  kana: string | null;
  hcp: number | null;
  gender: "male" | "female" | null;
  org: string | null;
  tel: string | null;
  email: string | null;
  notes: string | null;
  paid: boolean;
  checked_in: boolean;
  check_in_at: string | null;
  custom_fields: Record<string, string | boolean>;
  sort_order: number;
  /** confirmed=参加確定 / applied=Web申込 / waitlist=キャンセル待ち / cancelled=取消（#233） */
  entry_status: "confirmed" | "applied" | "waitlist" | "cancelled";
  applied_at: string | null;
  agreed_at: string | null;
  source: "staff" | "web";
};

export type Group = {
  id: string;
  comp_id: string;
  name: string;
  tee: string | null;
  start_time: string | null;
  sort_order: number;
  members: { participant_id: string; position: number }[];
};

export type Score = {
  participant_id: string;
  holes: Record<string, number>;
  direct_gross: number | null;
  note: string | null;
};

export type Prize = { id: string; label: string; prize_name: string | null; winner_name: string | null; sort_order: number };
export type Team = {
  id: string;
  name: string;
  group_name: string | null;
  score: number | null;
  rank_label: string | null;
  note: string | null;
  members: string | null;
  sort_order: number;
};
export type Receipt = {
  id: string;
  participant_id: string | null;
  receipt_no: string;
  amount: number;
  purpose: string | null;
  issuer: string | null;
  issued_on: string;
};

/* ========== 取得 ========== */

/**
 * コンペを1件取り、アクターの会社・店舗スコープに入っているか確認する。
 * ★ 店舗が違えば「無い」として扱う（存在を教えない）。オーナーは会社の全店舗。
 * ★ cache() — レイアウトとページの両方から呼ばれるので、1リクエストにつき1回だけDBを叩く。
 */
export const getComp = cache(async (actor: Actor, compId: string): Promise<Comp | null> => {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_comps")
    .select("*")
    .eq("id", compId)
    .is("deleted_at", null)
    .maybeSingle();
  const comp = data as Comp | null;
  if (!comp) return null;
  if (comp.company_id !== actor.companyId) return null;
  if (comp.store_id && !actor.isOwner && !actor.storeIds.includes(comp.store_id)) return null;
  return normalizeComp(comp);
});

function normalizeComp(comp: Comp): Comp {
  return {
    ...comp,
    tee_options: comp.tee_options?.length ? comp.tee_options : ["1番ホール", "10番ホール"],
    reception_fields: comp.reception_fields?.length ? comp.reception_fields : DEFAULT_RECEPTION_FIELDS,
    survey_questions: comp.survey_questions ?? [],
    entry_questions: comp.entry_questions ?? [],
    sheet_cols: comp.sheet_cols ?? {},
  };
}

export async function listComps(actor: Actor): Promise<(Comp & { participant_count: number })[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_comps")
    .select("*, cmp_participants(count)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("held_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  type Row = Comp & { cmp_participants?: { count: number }[] };
  return ((data ?? []) as Row[])
    .filter((c) => !c.store_id || actor.isOwner || actor.storeIds.includes(c.store_id))
    .map((c) => ({ ...normalizeComp(c), participant_count: c.cmp_participants?.[0]?.count ?? 0 }));
}

export async function listParticipants(compId: string): Promise<Participant[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_participants")
    .select("*")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as Participant[];
}

export async function listGroups(compId: string): Promise<Group[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_groups")
    .select("*, cmp_group_members(participant_id, position)")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order");
  type Row = Omit<Group, "members"> & { cmp_group_members?: { participant_id: string; position: number }[] };
  return ((data ?? []) as Row[]).map((g) => ({
    ...g,
    members: (g.cmp_group_members ?? []).sort((a, b) => a.position - b.position),
  }));
}

export async function listScores(compId: string): Promise<Record<string, ScoreInput>> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_scores")
    .select("participant_id, holes, direct_gross, note")
    .eq("comp_id", compId);
  const map: Record<string, ScoreInput> = {};
  for (const row of (data ?? []) as Score[]) {
    map[row.participant_id] = { holes: row.holes, direct_gross: row.direct_gross, note: row.note };
  }
  return map;
}

export async function listPrizes(compId: string): Promise<Prize[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_prizes")
    .select("id, label, prize_name, winner_name, sort_order")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order");
  return (data ?? []) as Prize[];
}

export async function listTeams(compId: string): Promise<Team[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_teams")
    .select("id, name, group_name, score, rank_label, note, members, sort_order")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order");
  return (data ?? []) as Team[];
}

export async function listReceipts(compId: string): Promise<Receipt[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_receipts")
    .select("id, participant_id, receipt_no, amount, purpose, issuer, issued_on")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as Receipt[];
}

/* ========== 既定値 ========== */

export const DEFAULT_RECEPTION_FIELDS: ReceptionField[] = [
  { id: "rf_checkin", label: "受付", type: "checkin", visible: true, builtin: true },
  { id: "rf_paid", label: "参加費", type: "paid", visible: true, builtin: true },
  { id: "rf_time", label: "受付時刻", type: "time", visible: true, builtin: true },
  { id: "rf_notes", label: "メモ", type: "notes", visible: true, builtin: true },
];

export const DEFAULT_PRIZES: { label: string }[] = [
  { label: "🥇 優勝" },
  { label: "🥈 準優勝" },
  { label: "🥉 3位" },
  { label: "4位" },
  { label: "5位" },
  { label: "🎭 ブービー賞" },
  { label: "🎭 ブービーメーカー賞" },
  { label: "🎯 ニアピン賞①" },
  { label: "🎯 ニアピン賞②" },
  { label: "💪 ドラコン賞①" },
  { label: "💪 ドラコン賞②" },
  { label: "⭐ ベストグロス" },
  { label: "🎁 参加賞" },
];

export const DEFAULT_SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: "q1", type: "radio", text: "今日のコンペはいかがでしたか？", options: ["とても満足", "満足", "普通", "不満", "とても不満"] },
  { id: "q2", type: "radio", text: "コースのコンディションはいかがでしたか？", options: ["とても良い", "良い", "普通", "悪い", "とても悪い"] },
  { id: "q3", type: "radio", text: "運営・スタッフの対応はいかがでしたか？", options: ["とても良い", "良い", "普通", "悪い", "とても悪い"] },
  { id: "q4", type: "radio", text: "参加費は適切でしたか？", options: ["とても適切", "適切", "普通", "高い", "とても高い"] },
  { id: "q5", type: "radio", text: "次回もご参加いただけますか？", options: ["ぜひ参加したい", "参加したい", "未定", "参加しない"] },
  { id: "q6", type: "checkbox", text: "特に良かった点を選んでください（複数可）", options: ["コースが良い", "景品が良い", "組み合わせが良い", "食事が良い", "天気が良かった", "その他"] },
  { id: "q7", type: "text", text: "改善してほしい点や、ご意見・ご要望をお聞かせください。", options: [] },
  { id: "q8", type: "text", text: "次回コンペで希望するコース・ゴルフ場があればお書きください。", options: [] },
];

export const DEFAULT_PERSONAL_SHEET_COLS: SheetCol[] = [
  { id: "no", label: "No.", fixed: true },
  { id: "name", label: "氏名", fixed: true },
  { id: "gross", label: "GROSS" },
  { id: "hcp", label: "HCP" },
  { id: "net", label: "NET" },
  { id: "rank", label: "順位" },
];

export const DEFAULT_TEAM_SHEET_COLS: SheetCol[] = [
  { id: "no", label: "No.", fixed: true },
  { id: "name", label: "チーム名", fixed: true },
  { id: "members", label: "メンバー" },
  { id: "score", label: "スコア" },
  { id: "rank", label: "順位" },
];

/* ========== 募集ページ（ログイン不要・#233） ========== */

/**
 * 募集URLのslugからコンペを引く。
 * ★ ここはログインしていない人が触る経路なので、返すのは「掲示に出す情報」だけにする。
 *   参加者名簿は返さない（誰が申し込んだかは、申し込む側からは見えない）。
 */
export async function getCompByEntrySlug(slug: string): Promise<Comp | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("cmp_comps")
    .select("*")
    .eq("entry_slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  const comp = data as Comp | null;
  return comp ? normalizeComp(comp) : null;
}

/** 枠の残り。confirmed と applied を「席が埋まっている人」として数える（キャンセル待ちは数えない） */
export async function countEntries(compId: string): Promise<{ taken: number; waitlist: number }> {
  const admin = createAdmin();
  const [{ count: taken }, { count: waitlist }] = await Promise.all([
    admin
      .from("cmp_participants")
      .select("id", { count: "exact", head: true })
      .eq("comp_id", compId)
      .is("deleted_at", null)
      .in("entry_status", ["confirmed", "applied"]),
    admin
      .from("cmp_participants")
      .select("id", { count: "exact", head: true })
      .eq("comp_id", compId)
      .is("deleted_at", null)
      .eq("entry_status", "waitlist"),
  ]);
  return { taken: taken ?? 0, waitlist: waitlist ?? 0 };
}

/** 募集ページを開いてよいか（受付前・締切・停止を1か所で判定する） */
export type EntryGate =
  | { ok: true }
  | { ok: false; reason: "closed" | "before" | "after"; opensOn?: string; closesOn?: string };

export function entryGate(comp: Comp, todayJst: string): EntryGate {
  if (!comp.entry_open) return { ok: false, reason: "closed" };
  if (comp.entry_opens_on && todayJst < comp.entry_opens_on)
    return { ok: false, reason: "before", opensOn: comp.entry_opens_on };
  if (comp.entry_closes_on && todayJst > comp.entry_closes_on)
    return { ok: false, reason: "after", closesOn: comp.entry_closes_on };
  return { ok: true };
}
