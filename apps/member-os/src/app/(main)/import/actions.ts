"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";

export type ImportState = { ok?: boolean; error?: string; message?: string };

function cellText(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("").trim() || null;
    if (o.text != null) return String(o.text).trim() || null;
    if (o.result != null) return String(o.result).trim() || null;
  }
  const s = String(v).trim();
  return s === "" ? null : s;
}
function cellDate(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}
function cellInt(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function cellTime(v: ExcelJS.CellValue): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(11, 16);
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}
function cellNum(v: ExcelJS.CellValue): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** 氏名を照合用に正規化（全角/半角スペース・記号を除去）。スマートハロと受付一覧の氏名を突合するのに使う。 */
function normName(s: string | null | undefined): string {
  return String(s ?? "").replace(/[\s　・,、。]/g, "").trim();
}
/** 電話番号を照合用に数字のみへ正規化（末尾10〜11桁）。固定/携帯どちらでも突合できるようにする。 */
function phoneKey(s: string | null | undefined): string | null {
  const d = String(s ?? "").replace(/[^\d]/g, "");
  return d.length >= 10 ? d.slice(-11) : null;
}
/** 'YYYY-MM-DD' に日数を加減して 'YYYY-MM-DD' を返す。 */
function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ExcelJS が「既定名前空間」で来ることを前提にしているパート本体の名前空間。
// Smart Hello の一部エクスポートはこれらを接頭辞付き（<x:workbook>, <ap:Properties> 等）で出力するため
// ExcelJS が解釈できず undefined 参照で落ちる（"reading 'sheets'" / "reading 'company'"）。
// core.xml(dc/cp) は元々接頭辞付きが正なので対象外。
const DEFAULT_NS_URIS = [
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main", // workbook/worksheet/styles/sharedStrings
  "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties", // docProps/app.xml
];

/** 接頭辞付きの本体名前空間を検出したら、該当接頭辞を外して既定名前空間に正規化し直す。 */
async function normalizeSpreadsheetNamespace(buf: ArrayBuffer | Buffer): Promise<Buffer | null> {
  const zip = await JSZip.loadAsync(buf);
  let changed = false;
  const paths = Object.keys(zip.files).filter((p) => /\.(xml|rels)$/i.test(p) && !zip.files[p].dir);
  for (const p of paths) {
    let xml = await zip.files[p].async("string");
    let partChanged = false;
    for (const uri of DEFAULT_NS_URIS) {
      const m = xml.match(new RegExp(`xmlns:([A-Za-z0-9]+)="${uri.replace(/[\/.]/g, "\\$&")}"`));
      if (!m) continue;
      const px = m[1];
      xml = xml
        .split(`<${px}:`).join("<")
        .split(`</${px}:`).join("</")
        .replace(`xmlns:${px}="${uri}"`, `xmlns="${uri}"`);
      partChanged = true;
    }
    if (partChanged) {
      zip.file(p, xml);
      changed = true;
    }
  }
  if (!changed) return null;
  return zip.generateAsync({ type: "nodebuffer" });
}

async function loadSheet(formData: FormData): Promise<ExcelJS.Worksheet | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  // 元バイト列をNode Bufferで保持。ExcelJSのloadがArrayBufferをdetach/consumeする環境があり、
  // その状態でフォールバック(JSZip)に同じバッファを渡すと "Can't find end of central directory" で落ちる。
  // → 各ローダに毎回コピー(Buffer.from)を渡して回避する。
  const base = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(base));
  } catch (e) {
    // 名前空間接頭辞付き（Smart Hello形式）を正規化して再読込
    const fixed = await normalizeSpreadsheetNamespace(Buffer.from(base));
    if (!fixed) throw e;
    await wb.xlsx.load(fixed);
  }
  return wb.worksheets[0] ?? null;
}

/** Smart Hello「会員名簿」取込（全件スナップショット洗い替え・機微列は取り込まない） */
export async function importMembers(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "会員名簿ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  const rows: Record<string, unknown>[] = [];
  // 体験→入会の自動照合用に、氏名・生年月日・電話（固定/携帯）を控える（mbr_membersには保存しない機微情報）
  const contactByNo = new Map<string, string[]>();
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const memberNo = cellText(C(row, 1));
    if (!memberNo) return;
    contactByNo.set(memberNo, [cellText(C(row, 49)), cellText(C(row, 50))].filter(Boolean) as string[]);
    rows.push({
      company_id: actor.companyId,
      member_no: memberNo,
      name: cellText(C(row, 2)),
      name_kana: cellText(C(row, 3)),
      gender: cellText(C(row, 4)),
      birth_date: cellDate(C(row, 5)),
      age: cellInt(C(row, 6)),
      join_date: cellDate(C(row, 7)),
      leave_date: cellDate(C(row, 9)),
      leave_reason: cellText(C(row, 32)),
      member_type: cellText(C(row, 19)),
      class_name: cellText(C(row, 21)),
      store_name: cellText(C(row, 15)),
      campaign: cellText(C(row, 29)),
      suspend_start: cellText(C(row, 37)),
      suspend_end: cellText(C(row, 38)),
      payment_method: cellText(C(row, 69)),
      monthly_visits: cellInt(C(row, 86)),
      last_visit_date: cellDate(C(row, 87)),
    });
  });
  if (rows.length === 0) return { error: "会員データが見つかりません（列が想定と異なる可能性）" };

  // 会員番号の重複を除外（法人会員の2枚目カード等は同一会員番号→先勝ちで1件に集約、会員数の二重計上も防止）
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    const k = String(r.member_no);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const dropped = rows.length - deduped.length;

  await admin.from("mbr_members").delete().eq("company_id", actor.companyId);
  for (let i = 0; i < deduped.length; i += 500) {
    const { error } = await admin.from("mbr_members").insert(deduped.slice(i, i + 500));
    if (error) return { error: `取込エラー: ${error.message}` };
  }
  await admin.rpc("refresh_smart_hello_kpis", { p_company_id: actor.companyId });

  // ── 体験→入会の自動反映 ──────────────────────────────
  // 会員名簿の入会者と、受付一覧の体験(result未確定)を「氏名＋(生年月日 or 電話)」で突合し、
  // 入会日が体験日の前後（-60日以降）なら result=入会 を自動セット。
  type Joiner = { keys: Set<string>; birth: string | null; join: string };
  const joinerIndex = new Map<string, Joiner[]>();
  for (const r of deduped) {
    if (!r.join_date) continue;
    const nm = normName(r.name as string | null);
    if (!nm) continue;
    const phones = (contactByNo.get(String(r.member_no)) ?? [])
      .map((p) => phoneKey(p))
      .filter(Boolean) as string[];
    const j: Joiner = { keys: new Set(phones), birth: r.birth_date ? String(r.birth_date) : null, join: String(r.join_date) };
    const arr = joinerIndex.get(nm) ?? [];
    arr.push(j);
    joinerIndex.set(nm, arr);
  }

  let joinsMarked = 0;
  if (joinerIndex.size > 0) {
    const { data: visits } = await admin
      .from("mbr_walkin_visits")
      .select("id, visited_on, result, mbr_guests(name, birth_date, phone)")
      .eq("company_id", actor.companyId)
      .eq("visit_type", "trial")
      .is("deleted_at", null);
    const toJoin: string[] = [];
    for (const v of (visits ?? []) as Record<string, unknown>[]) {
      if (v.result === "join") continue;
      const g = (v.mbr_guests ?? {}) as Record<string, unknown>;
      const nm = normName(g.name as string | null);
      const cands = joinerIndex.get(nm);
      if (!cands) continue;
      const gBirth = g.birth_date ? String(g.birth_date) : null;
      const gPhone = phoneKey(g.phone as string | null);
      const visitedOn = String(v.visited_on);
      const minJoin = addDays(visitedOn, -60);
      const hit = cands.some(
        (c) =>
          c.join >= minJoin &&
          ((gBirth && c.birth && gBirth === c.birth) || (gPhone && c.keys.has(gPhone)))
      );
      if (hit) toJoin.push(String(v.id));
    }
    for (let i = 0; i < toJoin.length; i += 200) {
      const { error } = await admin
        .from("mbr_walkin_visits")
        .update({ result: "join", updated_at: new Date().toISOString() })
        .in("id", toJoin.slice(i, i + 200));
      if (!error) joinsMarked += toJoin.slice(i, i + 200).length;
    }
    if (joinsMarked > 0) await admin.rpc("refresh_member_kpis", { p_company_id: actor.companyId });
  }

  await logAudit(actor, "smarthello.members_import", "mbr_members", null, null, {
    count: deduped.length,
    dropped,
    joinsMarked,
  });
  revalidatePath("/import");
  revalidatePath("/");
  return {
    ok: true,
    message: `会員名簿を取込みました（${deduped.length}件${
      dropped ? `／会員番号重複${dropped}件を集約` : ""
    }）。会員数・退会率KPIを更新${
      joinsMarked ? `／体験→入会を自動反映 ${joinsMarked}件` : ""
    }しました。`,
  };
}

/** Smart Hello「予約一覧」取込（予約番号で重複防止・個人情報は取り込まない） */
export async function importReservations(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "予約一覧ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  const rows: Record<string, unknown>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const no = cellText(C(row, 18));
    if (!no) return;
    rows.push({
      company_id: actor.companyId,
      reservation_no: no,
      store_name: cellText(C(row, 2)),
      program_type: cellText(C(row, 4)),
      program: cellText(C(row, 6)),
      place: cellText(C(row, 9)),
      staff_name: cellText(C(row, 12)),
      lesson_date: cellDate(C(row, 15)),
      start_time: cellTime(C(row, 16)),
      end_time: cellTime(C(row, 17)),
      reservation_kind: cellText(C(row, 19)),
      member_no: cellText(C(row, 20)),
      status: cellText(C(row, 37)),
      attendance: cellText(C(row, 41)),
      amount: cellInt(C(row, 45)),
    });
  });
  if (rows.length === 0) return { error: "予約データが見つかりません（列が想定と異なる可能性）" };

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin
      .from("mbr_reservations")
      .upsert(rows.slice(i, i + 500), { onConflict: "company_id,reservation_no" });
    if (error) return { error: `取込エラー: ${error.message}` };
  }
  await logAudit(actor, "smarthello.reservations_import", "mbr_reservations", null, null, { count: rows.length });
  revalidatePath("/import");
  return { ok: true, message: `予約一覧を取込みました（${rows.length}件・予約番号で重複排除）。` };
}

/**
 * スマートハロ「予約一覧」から体験・フィッティングだけを抽出して受付一覧(mbr_walkin_visits)へ反映。
 * 打席（練習タイム/スタッフアワー）・パーソナル等は除外。予約番号で冪等化（再取込で重複行を作らない）。
 * 予約者の氏名・連絡先も取り込む（体験→入会の自動照合に使うため）。
 */
export async function importTrialReservations(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "予約一覧ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  const { data: store } = await admin
    .from("stores").select("id")
    .eq("company_id", actor.companyId).eq("code", "takarazuka").maybeSingle();
  const storeId = (store?.id as string | undefined) ?? null;

  type Cand = {
    reservationNo: string;
    visitedOn: string;
    visitType: "trial" | "fitting";
    guest: Record<string, unknown>;
    kindLabel: string | null;
  };
  const cands: Cand[] = [];
  let skippedCancel = 0;

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const kind = cellText(C(row, 4)) ?? "";
    const program = cellText(C(row, 6)) ?? "";
    const kubun = cellText(C(row, 19)) ?? "";
    const blob = `${kind}${program}${kubun}`;
    const isFitting = blob.includes("フィッティング");
    const isTrial = blob.includes("体験") || kubun === "体験";
    if (!isFitting && !isTrial) return; // 打席・練習・パーソナル等は対象外

    const reservationNo = cellText(C(row, 18));
    const name = cellText(C(row, 21));
    const visitedOn = cellDate(C(row, 15));
    if (!reservationNo || !name || !visitedOn) return;

    // キャンセルは受付一覧に載せない
    const status = cellText(C(row, 37)) ?? "";
    if (status.includes("キャンセル") || cellText(C(row, 38))) {
      skippedCancel++;
      return;
    }

    const pref = cellText(C(row, 27)) ?? "";
    const city = cellText(C(row, 28)) ?? "";
    const bldg = cellText(C(row, 29)) ?? "";
    cands.push({
      reservationNo,
      visitedOn,
      visitType: isFitting ? "fitting" : "trial",
      kindLabel: kind || null,
      guest: {
        company_id: actor.companyId,
        store_id: storeId,
        name,
        name_kana: cellText(C(row, 22)),
        birth_date: cellDate(C(row, 23)),
        gender: normGender(cellText(C(row, 25))),
        postal_code: cellText(C(row, 26)),
        prefecture: pref || null,
        address1: `${pref}${city}${bldg}`.trim() || null,
        phone: cellText(C(row, 30)) ?? cellText(C(row, 31)),
        email: cellText(C(row, 32)),
      },
    });
  });

  if (cands.length === 0)
    return { error: "体験・フィッティングの予約が見つかりません（打席/練習のみ、または列が想定と異なる可能性）" };

  // 既に取り込み済みの予約番号（冪等化）
  const nos = cands.map((c) => c.reservationNo);
  const existing = new Set<string>();
  for (let i = 0; i < nos.length; i += 500) {
    const { data } = await admin
      .from("mbr_walkin_visits")
      .select("source_reservation_no")
      .eq("company_id", actor.companyId)
      .in("source_reservation_no", nos.slice(i, i + 500));
    (data ?? []).forEach((r) => r.source_reservation_no && existing.add(String(r.source_reservation_no)));
  }
  const fresh = cands.filter((c) => !existing.has(c.reservationNo));

  let added = 0;
  for (const c of fresh) {
    const gid = randomUUID();
    const { error: ge } = await admin.from("mbr_guests").insert({ id: gid, ...c.guest });
    if (ge) return { error: `ゲスト取込エラー: ${ge.message}` };
    const { error: ve } = await admin.from("mbr_walkin_visits").insert({
      company_id: actor.companyId,
      store_id: storeId,
      guest_id: gid,
      visited_on: c.visitedOn,
      visit_type: c.visitType,
      source_reservation_no: c.reservationNo,
      referral_source: "スマートハロ予約",
      survey: compact({ reservation_kind_label: c.kindLabel }),
      is_migrated: false,
    });
    if (ve) return { error: `受付一覧への反映エラー: ${ve.message}` };
    added++;
  }

  await admin.rpc("refresh_member_kpis", { p_company_id: actor.companyId });
  await logAudit(actor, "smarthello.trial_reservations_import", "mbr_walkin_visits", null, null, {
    added,
    skippedExisting: cands.length - fresh.length,
    skippedCancel,
  });
  revalidatePath("/import");
  revalidatePath("/");
  return {
    ok: true,
    message: `体験・フィッティング予約を受付一覧に反映しました（新規${added}件${
      cands.length - fresh.length ? `／取込済スキップ${cands.length - fresh.length}件` : ""
    }${skippedCancel ? `／キャンセル除外${skippedCancel}件` : ""}）。`,
  };
}

// ---- 一時利用者名簿（現行Excel台帳）→ mbr_guests / mbr_walkin_visits 移行（Phase D / DECISIONS #28） ----

const WALKIN_VISIT_TYPE: Record<string, string> = {
  体験利用: "trial",
  フィッティング: "fitting",
  シャフト試打: "fitting",
  打席利用: "bay",
  ビジター打席: "visitor_bay",
};
const WALKIN_STD_TYPES = new Set(["体験利用", "フィッティング", "打席利用", "ビジター打席"]);

function normVisitType(s: string | null): { type: string; label: string | null } {
  const k = (s ?? "").trim();
  const type = WALKIN_VISIT_TYPE[k] ?? "other";
  return { type, label: k && !WALKIN_STD_TYPES.has(k) ? k : null };
}
function normResult(s: string | null): { result: string; label: string | null } {
  const k = (s ?? "").trim();
  if (!k) return { result: "none", label: null };
  if (k.includes("興味なし")) return { result: "none", label: k };
  if (k.includes("入会")) return { result: "join", label: k.length > 2 ? k : null };
  if (k.includes("購入")) return { result: "purchase", label: k.length > 2 ? k : null };
  return { result: "none", label: k };
}
function normPayment(s: string | null): string | null {
  const k = (s ?? "").trim();
  if (!k) return null;
  if (k.includes("店")) return "store";
  if (/web/i.test(k)) return "web";
  if (k.includes("無料")) return "free_campaign";
  return "other";
}
function normGender(s: string | null): string | null {
  const k = (s ?? "").trim();
  if (k.startsWith("男")) return "male";
  if (k.startsWith("女")) return "female";
  return null;
}
function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
  );
}

/**
 * 現行「（新）一時利用者名簿.xlsx」台帳シート（A〜X＝実データ）を取込む。
 * 既存の移行行(is_migrated=true)を洗い替え、タブレット由来の実来店は保持する。
 * 日付・氏名がある行のみ対象（時系列KPIの整合のため）。
 */
export async function importWalkins(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const actor = await requireReceptionActor();
  const ws = await loadSheet(formData);
  if (!ws) return { error: "一時利用者名簿ファイルを選択してください" };
  const admin = createAdmin();
  const C = (row: ExcelJS.Row, i: number) => row.getCell(i).value;

  // 宝塚店（code=takarazuka）を優先。無ければ null。
  const { data: store } = await admin
    .from("stores")
    .select("id")
    .eq("company_id", actor.companyId)
    .eq("code", "takarazuka")
    .maybeSingle();
  const storeId = (store?.id as string | undefined) ?? null;

  type GuestRow = Record<string, unknown> & { id: string };
  type VisitRow = Record<string, unknown> & { _on: string };
  const guests: GuestRow[] = [];
  const visits: VisitRow[] = [];
  let skipped = 0;

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const name = cellText(C(row, 3));
    const visitedOn = cellDate(C(row, 1));
    if (!name || !visitedOn) {
      if (name || visitedOn) skipped++;
      return;
    }
    const gid = randomUUID();
    guests.push({
      id: gid,
      company_id: actor.companyId,
      store_id: storeId,
      name,
      name_kana: cellText(C(row, 4)),
      gender: normGender(cellText(C(row, 6))),
      birth_date: cellDate(C(row, 5)),
      postal_code: cellText(C(row, 7)),
      address1: cellText(C(row, 8)),
      phone: cellText(C(row, 10)),
      email: cellText(C(row, 11)),
      occupation: cellText(C(row, 12)),
      contact_method: cellText(C(row, 13)),
      distance_km: cellNum(C(row, 9)),
    });

    const vt = normVisitType(cellText(C(row, 2)));
    const rr = normResult(cellText(C(row, 20)));
    const goals = [cellText(C(row, 38)), cellText(C(row, 39)), cellText(C(row, 40))].filter(Boolean);
    const survey = compact({
      visit_type_label: vt.label,
      result_label: rr.label,
      reception_staff_name: cellText(C(row, 19)),
      fitting_answer: cellText(C(row, 25)),
      trial_reason: cellText(C(row, 32)),
      school_goals: goals,
      join_interest: cellText(C(row, 41)),
      follow_comment: cellText(C(row, 42)),
      joined_from_trial: cellText(C(row, 43)),
    });

    visits.push({
      _on: visitedOn,
      company_id: actor.companyId,
      store_id: storeId,
      guest_id: gid,
      visited_on: visitedOn,
      visit_type: vt.type,
      fee: cellInt(C(row, 14)),
      discount: cellText(C(row, 15)),
      payment_method: normPayment(cellText(C(row, 17))),
      pro_staff: cellText(C(row, 18)),
      result: rr.result,
      repeat_date: cellDate(C(row, 16)),
      reapproach_date: cellDate(C(row, 21)) ?? cellDate(C(row, 44)),
      referral_source: cellText(C(row, 23)),
      referral_source_other: cellText(C(row, 24)),
      note: cellText(C(row, 22)),
      survey,
      is_migrated: true,
    });
  });

  if (visits.length === 0)
    return { error: "台帳データが見つかりません（日付・氏名のある行が0件／列が想定と異なる可能性）" };

  // 連番(visit_seq)が時系列に沿うよう来店日で並べて投入
  visits.sort((a, b) => (a._on < b._on ? -1 : a._on > b._on ? 1 : 0));
  visits.forEach((v) => delete (v as { _on?: string })._on);

  // 既存の移行行を洗い替え（タブレット実来店 is_migrated=false は保持）
  await admin.from("mbr_walkin_visits").delete().eq("company_id", actor.companyId).eq("is_migrated", true);
  // 移行由来で参照されなくなったゲストを掃除
  const { data: liveGuestIds } = await admin
    .from("mbr_walkin_visits")
    .select("guest_id")
    .eq("company_id", actor.companyId);
  const keep = new Set((liveGuestIds ?? []).map((r) => r.guest_id as string).filter(Boolean));
  const { data: allGuests } = await admin
    .from("mbr_guests")
    .select("id")
    .eq("company_id", actor.companyId);
  const orphans = (allGuests ?? []).map((g) => g.id as string).filter((id) => !keep.has(id));
  for (let i = 0; i < orphans.length; i += 500) {
    await admin.from("mbr_guests").delete().in("id", orphans.slice(i, i + 500));
  }

  for (let i = 0; i < guests.length; i += 500) {
    const { error } = await admin.from("mbr_guests").insert(guests.slice(i, i + 500));
    if (error) return { error: `ゲスト取込エラー: ${error.message}` };
  }
  for (let i = 0; i < visits.length; i += 500) {
    const { error } = await admin.from("mbr_walkin_visits").insert(visits.slice(i, i + 500));
    if (error) return { error: `台帳取込エラー: ${error.message}` };
  }
  await admin.rpc("refresh_member_kpis", { p_company_id: actor.companyId });
  await logAudit(actor, "walkin.ledger_import", "mbr_walkin_visits", null, null, {
    visits: visits.length,
    skipped,
  });
  revalidatePath("/import");
  return {
    ok: true,
    message: `一時利用者名簿を取込みました（${visits.length}件・移行分を洗い替え${
      skipped ? `／不備でスキップ${skipped}件` : ""
    }）。体験→入会率・フィッティング→購入率KPIを更新しました。`,
  };
}
