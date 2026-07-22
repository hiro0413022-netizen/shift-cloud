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

  const u8 = new Uint8Array(await file.arrayBuffer());
  const sig = Array.from(u8.slice(0, 4)).map((b) => b.toString(16).padStart(2, "0")).join(" ");
  // 診断ログ（Vercelランタイムログに出る）。取込エラー切り分け用。
  console.log(`[import:loadSheet] name=${file.name} declaredSize=${file.size} readBytes=${u8.length} sig=${sig}`);

  // xlsx は ZIP（先頭 50 4b）。空/別形式（.xls=d0 cf, CSV=テキスト）なら分かりやすいエラーにする。
  if (u8.length < 4 || u8[0] !== 0x50 || u8[1] !== 0x4b) {
    throw new Error(
      `アップロードされたファイルを .xlsx（ZIP形式）として読めませんでした（先頭バイト: ${sig} / サイズ ${u8.length}）。` +
        `Smart Hello から「.xlsx」でエクスポートし直して選択してください（.xls や CSV は不可）。`
    );
  }

  const wb = new ExcelJS.Workbook();
  // Smart Hello は本体名前空間が接頭辞付き（<x:workbook> 等）で ExcelJS が解釈できないため、
  // 先に JSZip で正規化してから ExcelJS に一度だけ渡す（try/catchの二重読みによるバッファ問題を避ける）。
  let normalized: Buffer | null = null;
  try {
    normalized = await normalizeSpreadsheetNamespace(Buffer.from(u8));
  } catch (e) {
    console.error("[import:loadSheet] namespace normalize failed:", e instanceof Error ? e.message : String(e));
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load((normalized ?? Buffer.from(u8)) as any);
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
