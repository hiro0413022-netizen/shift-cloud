"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getComp, type ReceptionField, type SheetCol, type SurveyQuestion } from "@/lib/compe";

/** コンペを触る前に必ず通す。会社・店舗スコープ外なら例外（DECISIONS #11） */
async function guard(compId: string) {
  const actor = await requireActor();
  const comp = await getComp(actor, compId);
  if (!comp) throw new Error("コンペが見つかりません");
  return { actor, comp, admin: createAdmin() };
}

function refresh(compId: string) {
  revalidatePath(`/c/${compId}`, "layout");
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const strOrNull = (fd: FormData, key: string) => str(fd, key) || null;
const intOr = (fd: FormData, key: string, fallback: number) => {
  const n = Number.parseInt(str(fd, key), 10);
  return Number.isFinite(n) ? n : fallback;
};

/* ========== コンペ設定 ========== */

export async function saveSetup(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  await admin
    .from("cmp_comps")
    .update({
      name: str(formData, "name"),
      held_on: strOrNull(formData, "held_on"),
      venue: strOrNull(formData, "venue"),
      course: strOrNull(formData, "course"),
      organizer: strOrNull(formData, "organizer"),
      contact: strOrNull(formData, "contact"),
      fee: intOr(formData, "fee", 0),
      start_time: strOrNull(formData, "start_time"),
      meet_time: strOrNull(formData, "meet_time"),
      format: str(formData, "format") || "stroke",
      team_size: intOr(formData, "team_size", 4),
      tee_options: str(formData, "tee_options")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      notes: strOrNull(formData, "notes"),
      status: str(formData, "status") || "planning",
      play_fee: str(formData, "play_fee") === "" ? null : intOr(formData, "play_fee", 0),
    })
    .eq("id", compId);
  refresh(compId);
}

/* ========== 募集ページ（#233） ========== */

export async function saveEntrySettings(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  const slug = str(formData, "entry_slug")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  await admin
    .from("cmp_comps")
    .update({
      entry_slug: slug || null,
      entry_open: str(formData, "entry_open") === "1",
      entry_capacity: str(formData, "entry_capacity") === "" ? null : intOr(formData, "entry_capacity", 0),
      entry_opens_on: strOrNull(formData, "entry_opens_on"),
      entry_closes_on: strOrNull(formData, "entry_closes_on"),
      entry_note: strOrNull(formData, "entry_note"),
      entry_terms: strOrNull(formData, "entry_terms"),
    })
    .eq("id", compId);
  refresh(compId);
}

/** 申込→確定、キャンセル待ち→確定、取消 などの状態変更 */
export async function setEntryStatus(
  compId: string,
  participantId: string,
  status: "confirmed" | "applied" | "waitlist" | "cancelled"
): Promise<void> {
  const { admin } = await guard(compId);
  await admin
    .from("cmp_participants")
    .update({ entry_status: status })
    .eq("id", participantId)
    .eq("comp_id", compId);
  refresh(compId);
}

/* ========== 参加者 ========== */

export async function upsertParticipant(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  const id = strOrNull(formData, "participant_id");
  const hcpRaw = str(formData, "hcp");
  const row = {
    comp_id: compId,
    name: str(formData, "name"),
    kana: strOrNull(formData, "kana"),
    hcp: hcpRaw === "" ? null : Number.parseFloat(hcpRaw),
    gender: (strOrNull(formData, "gender") as "male" | "female" | null) ?? null,
    org: strOrNull(formData, "org"),
    tel: strOrNull(formData, "tel"),
    email: strOrNull(formData, "email"),
    notes: strOrNull(formData, "notes"),
  };
  if (!row.name) return;
  if (id) await admin.from("cmp_participants").update(row).eq("id", id).eq("comp_id", compId);
  else {
    const { count } = await admin
      .from("cmp_participants")
      .select("id", { count: "exact", head: true })
      .eq("comp_id", compId)
      .is("deleted_at", null);
    await admin.from("cmp_participants").insert({ ...row, sort_order: count ?? 0 });
  }
  refresh(compId);
}

export async function deleteParticipant(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  const id = str(formData, "participant_id");
  await admin.from("cmp_participants").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("comp_id", compId);
  // 組から外す（消した人が組に残ると案内文の人数が合わなくなる）
  await admin.from("cmp_group_members").delete().eq("participant_id", id);
  refresh(compId);
}

/** CSV貼り付け一括取込。氏名,フリガナ,HCP,性別,所属,電話,メール,参加費(0/1),メモ */
export async function importParticipants(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  const text = String(formData.get("csv") ?? "");
  const skipHeader = str(formData, "skip_header") === "1";

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const body = skipHeader ? lines.slice(1) : lines;
  const { count } = await admin
    .from("cmp_participants")
    .select("id", { count: "exact", head: true })
    .eq("comp_id", compId)
    .is("deleted_at", null);

  const rows = body
    .map((line, i) => {
      const c = splitCsvLine(line);
      const name = (c[0] ?? "").trim();
      if (!name) return null;
      const hcp = (c[2] ?? "").trim();
      const gender = (c[3] ?? "").trim().toLowerCase();
      return {
        comp_id: compId,
        name,
        kana: (c[1] ?? "").trim() || null,
        hcp: hcp === "" ? null : Number.parseFloat(hcp),
        gender: gender === "female" || gender === "女" ? "female" : gender === "male" || gender === "男" ? "male" : null,
        org: (c[4] ?? "").trim() || null,
        tel: (c[5] ?? "").trim() || null,
        email: (c[6] ?? "").trim() || null,
        paid: (c[7] ?? "").trim() === "1",
        notes: (c[8] ?? "").trim() || null,
        sort_order: (count ?? 0) + i,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length) await admin.from("cmp_participants").insert(rows);
  refresh(compId);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ========== 受付 ========== */

export async function setCheckIn(compId: string, participantId: string, checked: boolean): Promise<void> {
  const { admin } = await guard(compId);
  await admin
    .from("cmp_participants")
    .update({ checked_in: checked, check_in_at: checked ? new Date().toISOString() : null })
    .eq("id", participantId)
    .eq("comp_id", compId);
  refresh(compId);
}

export async function setPaid(compId: string, participantId: string, paid: boolean): Promise<void> {
  const { admin } = await guard(compId);
  await admin.from("cmp_participants").update({ paid }).eq("id", participantId).eq("comp_id", compId);
  refresh(compId);
}

export async function setCustomField(
  compId: string,
  participantId: string,
  fieldId: string,
  value: string | boolean
): Promise<void> {
  const { admin } = await guard(compId);
  const { data } = await admin
    .from("cmp_participants")
    .select("custom_fields")
    .eq("id", participantId)
    .eq("comp_id", compId)
    .single();
  const current = (data?.custom_fields ?? {}) as Record<string, string | boolean>;
  await admin
    .from("cmp_participants")
    .update({ custom_fields: { ...current, [fieldId]: value } })
    .eq("id", participantId)
    .eq("comp_id", compId);
  refresh(compId);
}

export async function setNotes(compId: string, participantId: string, notes: string): Promise<void> {
  const { admin } = await guard(compId);
  await admin.from("cmp_participants").update({ notes }).eq("id", participantId).eq("comp_id", compId);
  refresh(compId);
}

export async function saveReceptionFields(compId: string, fields: ReceptionField[]): Promise<void> {
  const { admin } = await guard(compId);
  await admin.from("cmp_comps").update({ reception_fields: fields }).eq("id", compId);
  refresh(compId);
}

/* ========== 組み合わせ ========== */

/**
 * HCP順に蛇行配置して組を作り直す。
 * ★ 既存の組は消える。手で直したあとに押すと戻るので、画面側で確認を出す。
 */
export async function autoGroup(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin, comp } = await guard(compId);
  const { data } = await admin
    .from("cmp_participants")
    .select("id, hcp")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order");
  const players = ((data ?? []) as { id: string; hcp: number | null }[]).sort(
    (a, b) => (a.hcp ?? 99) - (b.hcp ?? 99)
  );
  if (!players.length) return;

  await admin.from("cmp_groups").delete().eq("comp_id", compId);

  const size = comp.team_size || 4;
  const groupCount = Math.ceil(players.length / size);
  const tee = comp.tee_options[0] ?? "1番ホール";
  const { data: created } = await admin
    .from("cmp_groups")
    .insert(
      Array.from({ length: groupCount }, (_, i) => ({
        comp_id: compId,
        name: `${i + 1}組`,
        tee,
        sort_order: i,
      }))
    )
    .select("id, sort_order");

  const groups = ((created ?? []) as { id: string; sort_order: number }[]).sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const members: { group_id: string; participant_id: string; position: number }[] = [];
  const counters = new Array(groupCount).fill(0);
  players.forEach((p, i) => {
    const row = Math.floor(i / groupCount);
    const col = row % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    members.push({ group_id: groups[col].id, participant_id: p.id, position: counters[col]++ });
  });
  if (members.length) await admin.from("cmp_group_members").insert(members);
  refresh(compId);
}

export async function addGroup(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin, comp } = await guard(compId);
  const { count } = await admin
    .from("cmp_groups")
    .select("id", { count: "exact", head: true })
    .eq("comp_id", compId)
    .is("deleted_at", null);
  const n = (count ?? 0) + 1;
  await admin.from("cmp_groups").insert({
    comp_id: compId,
    name: `${n}組`,
    tee: comp.tee_options[0] ?? "1番ホール",
    sort_order: n - 1,
  });
  refresh(compId);
}

export async function updateGroup(compId: string, groupId: string, patch: Record<string, string>): Promise<void> {
  const { admin } = await guard(compId);
  await admin.from("cmp_groups").update(patch).eq("id", groupId).eq("comp_id", compId);
  refresh(compId);
}

export async function deleteGroup(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  await admin.from("cmp_groups").delete().eq("id", str(formData, "group_id")).eq("comp_id", compId);
  refresh(compId);
}

export async function clearGroups(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  await admin.from("cmp_groups").delete().eq("comp_id", compId);
  refresh(compId);
}

/** メンバーを組へ移す（groupId が null なら未割当に戻す） */
export async function moveMember(compId: string, participantId: string, groupId: string | null): Promise<void> {
  const { admin } = await guard(compId);
  // 一意索引があるので、まず外してから入れる（同じ人が2組に残らない）
  await admin.from("cmp_group_members").delete().eq("participant_id", participantId);
  if (groupId) {
    const { count } = await admin
      .from("cmp_group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId);
    await admin
      .from("cmp_group_members")
      .insert({ group_id: groupId, participant_id: participantId, position: count ?? 0 });
  }
  refresh(compId);
}

/* ========== 案内文 ========== */

export async function saveAnnouncement(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  await admin
    .from("cmp_comps")
    .update({
      ann_greeting: strOrNull(formData, "ann_greeting"),
      ann_closing: strOrNull(formData, "ann_closing"),
      ann_group_title: strOrNull(formData, "ann_group_title"),
      ann_show_hcp: str(formData, "ann_show_hcp") === "1",
    })
    .eq("id", compId);
  refresh(compId);
}

/* ========== スコア ========== */

export async function setHoleScore(compId: string, participantId: string, hole: number, value: number | null): Promise<void> {
  const { admin } = await guard(compId);
  const { data } = await admin
    .from("cmp_scores")
    .select("id, holes")
    .eq("participant_id", participantId)
    .maybeSingle();
  const holes = { ...((data?.holes ?? {}) as Record<string, number>) };
  if (value == null) delete holes[`h${hole}`];
  else holes[`h${hole}`] = value;

  if (data?.id) await admin.from("cmp_scores").update({ holes }).eq("id", data.id);
  else await admin.from("cmp_scores").insert({ comp_id: compId, participant_id: participantId, holes });
  refresh(compId);
}

export async function setDirectGross(compId: string, participantId: string, gross: number | null): Promise<void> {
  const { admin } = await guard(compId);
  await upsertScore(admin, compId, participantId, { direct_gross: gross });
  refresh(compId);
}

export async function setScoreNote(compId: string, participantId: string, note: string): Promise<void> {
  const { admin } = await guard(compId);
  await upsertScore(admin, compId, participantId, { note });
  refresh(compId);
}

async function upsertScore(
  admin: ReturnType<typeof createAdmin>,
  compId: string,
  participantId: string,
  patch: Record<string, unknown>
) {
  const { data } = await admin.from("cmp_scores").select("id").eq("participant_id", participantId).maybeSingle();
  if (data?.id) await admin.from("cmp_scores").update(patch).eq("id", data.id);
  else await admin.from("cmp_scores").insert({ comp_id: compId, participant_id: participantId, ...patch });
}

export async function saveSheetCols(compId: string, kind: "personal" | "team", cols: SheetCol[]): Promise<void> {
  const { admin, comp } = await guard(compId);
  await admin
    .from("cmp_comps")
    .update({ sheet_cols: { ...comp.sheet_cols, [kind]: cols } })
    .eq("id", compId);
  refresh(compId);
}

/* ========== 景品 ========== */

export async function savePrizes(compId: string, prizes: { id?: string; label: string; prize_name: string; winner_name: string }[]): Promise<void> {
  const { admin } = await guard(compId);
  const keep = prizes.filter((p) => p.id).map((p) => p.id as string);
  // 画面から消えた行は論理削除
  const { data: existing } = await admin
    .from("cmp_prizes")
    .select("id")
    .eq("comp_id", compId)
    .is("deleted_at", null);
  const gone = ((existing ?? []) as { id: string }[]).filter((e) => !keep.includes(e.id)).map((e) => e.id);
  if (gone.length) {
    await admin.from("cmp_prizes").update({ deleted_at: new Date().toISOString() }).in("id", gone);
  }
  for (const [i, p] of prizes.entries()) {
    const row = { label: p.label, prize_name: p.prize_name || null, winner_name: p.winner_name || null, sort_order: i };
    if (p.id) await admin.from("cmp_prizes").update(row).eq("id", p.id).eq("comp_id", compId);
    else await admin.from("cmp_prizes").insert({ comp_id: compId, ...row });
  }
  refresh(compId);
}

/* ========== 団体戦 ========== */

export async function saveTeams(
  compId: string,
  teams: { id?: string; name: string; group_name: string; score: number | null; rank_label: string; note: string; members: string }[]
): Promise<void> {
  const { admin } = await guard(compId);
  const keep = teams.filter((t) => t.id).map((t) => t.id as string);
  const { data: existing } = await admin.from("cmp_teams").select("id").eq("comp_id", compId).is("deleted_at", null);
  const gone = ((existing ?? []) as { id: string }[]).filter((e) => !keep.includes(e.id)).map((e) => e.id);
  if (gone.length) await admin.from("cmp_teams").update({ deleted_at: new Date().toISOString() }).in("id", gone);
  for (const [i, t] of teams.entries()) {
    const row = {
      name: t.name,
      group_name: t.group_name || null,
      score: t.score,
      rank_label: t.rank_label || null,
      note: t.note || null,
      members: t.members || null,
      sort_order: i,
    };
    if (t.id) await admin.from("cmp_teams").update(row).eq("id", t.id).eq("comp_id", compId);
    else await admin.from("cmp_teams").insert({ comp_id: compId, ...row });
  }
  refresh(compId);
}

/** 組み合わせからチームを作る（1組＝1チーム） */
export async function importTeamsFromGroups(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin } = await guard(compId);
  const { data: groups } = await admin
    .from("cmp_groups")
    .select("id, name, sort_order, cmp_group_members(participant_id, position)")
    .eq("comp_id", compId)
    .is("deleted_at", null)
    .order("sort_order");
  const { data: ps } = await admin
    .from("cmp_participants")
    .select("id, name")
    .eq("comp_id", compId)
    .is("deleted_at", null);
  const nameById = new Map(((ps ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  type G = { id: string; name: string; sort_order: number; cmp_group_members?: { participant_id: string; position: number }[] };
  const rows = ((groups ?? []) as G[]).map((g, i) => ({
    comp_id: compId,
    name: g.name,
    group_name: g.name,
    members: (g.cmp_group_members ?? [])
      .sort((a, b) => a.position - b.position)
      .map((m) => nameById.get(m.participant_id) ?? "")
      .filter(Boolean)
      .join("・"),
    sort_order: i,
  }));
  if (!rows.length) return;
  await admin.from("cmp_teams").delete().eq("comp_id", compId);
  await admin.from("cmp_teams").insert(rows);
  refresh(compId);
}

/* ========== 領収書 ========== */

export async function issueReceipt(formData: FormData): Promise<void> {
  const compId = str(formData, "comp_id");
  const { admin, actor, comp } = await guard(compId);
  const participantId = strOrNull(formData, "participant_id");
  const amount = intOr(formData, "amount", comp.fee);
  const issuedOn = str(formData, "issued_on") || new Date().toISOString().slice(0, 10);

  const { count } = await admin
    .from("cmp_receipts")
    .select("id", { count: "exact", head: true })
    .eq("comp_id", compId);
  const receiptNo = `R-${String((count ?? 0) + 1).padStart(4, "0")}`;

  await admin.from("cmp_receipts").insert({
    comp_id: compId,
    participant_id: participantId,
    receipt_no: receiptNo,
    amount,
    purpose: strOrNull(formData, "purpose"),
    issuer: strOrNull(formData, "issuer"),
    issued_on: issuedOn,
    issued_by: actor.staffId,
  });
  // 領収書を出した＝参加費を受け取っている
  if (participantId) await admin.from("cmp_participants").update({ paid: true }).eq("id", participantId);
  refresh(compId);
}

/* ========== アンケート ========== */

export async function saveSurvey(compId: string, title: string, desc: string, questions: SurveyQuestion[]): Promise<void> {
  const { admin } = await guard(compId);
  await admin
    .from("cmp_comps")
    .update({ survey_title: title || null, survey_desc: desc || null, survey_questions: questions })
    .eq("id", compId);
  refresh(compId);
}
