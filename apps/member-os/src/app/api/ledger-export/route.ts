import ExcelJS from "exceljs";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { VISIT_TYPE_LABEL, PAYMENT_LABEL, GENDER_LABEL } from "@/lib/walkin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 現行「一時利用顧客名簿」シートの列見出し（1:1再現、57列）
const HEADERS = [
  "日付", "利用区分", "名前", "フリガナ", "生年月日", "性別", "郵便番号", "住所", "お店までの距離",
  "電話番号", "email", "職業", "連絡方法", "利用料", "割引（公式ライン、社長紹介、ロータリー関連、再来）",
  "再来の場合日付記入", "支払い方法（店頭、WEB）", "担当プロ", "担当受付", "成約（入会、購入）",
  "再アプローチ\n(日付)", "備考", "何で知ったか", "何で知ったか\n(その他)",
  "1　（フィッティング）", "2　（フィッティング）", "3　（フィッティング）", "4　（フィッティング）", "5　（フィッティング）", "その他",
  "公式LINE　ｱﾌﾀｰﾌｫﾛｰ実施日",
  "1（体験理由）", "2（体験理由）", "3（体験理由）", "4（体験理由）", "5（体験理由）", "その他",
  "ゴルフスクールに通う目的　1", "ゴルフスクールに通う目的　2", "ゴルフスクールに通う目的　3",
  "入会興味の有無", "体験後のコメント、フォロー状況", "体験から\nの入会", "再アプローチ\n(日付)",
  "", "", "", "", "", "", "", "", "", "", "", "", "",
];

const RESULT_LABEL: Record<string, string> = { join: "入会", purchase: "購入", none: "" };

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

export async function GET(request: Request) {
  await requireReceptionActor();
  const admin = createAdmin();
  const url = new URL(request.url);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from")! : "1900-01-01";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") ?? "") ? url.searchParams.get("to")! : "2999-12-31";
  const type = url.searchParams.get("type") ?? "";

  let q = admin
    .from("mbr_walkin_visits")
    .select("*, mbr_guests(name, name_kana, birth_date, gender, postal_code, address1, distance_km, phone, email, occupation, contact_method), reception:staff!reception_staff_id(name)")
    .is("deleted_at", null)
    .gte("visited_on", from)
    .lte("visited_on", to)
    .order("visited_on", { ascending: true })
    .order("visit_seq", { ascending: true });
  if (["trial", "fitting", "bay", "visitor_bay", "other"].includes(type)) q = q.eq("visit_type", type);

  const { data } = await q;
  const rows = (data ?? []) as Record<string, unknown>[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("一時利用顧客名簿");
  const header = ws.addRow(HEADERS);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };

  for (const v of rows) {
    const g = (v.mbr_guests ?? {}) as Record<string, unknown>;
    const rec = (v.reception ?? {}) as Record<string, unknown>;
    const survey = (v.survey ?? {}) as Record<string, unknown>;
    const fitting = (survey.fitting_reasons as string[]) ?? [];
    const trial = (survey.trial_reasons as string[]) ?? [];
    const goals = (survey.school_goals as string[]) ?? [];
    const result = s(v.result);

    const row = new Array(57).fill("");
    row[0] = s(v.visited_on);
    row[1] = VISIT_TYPE_LABEL[s(v.visit_type)] ?? s(v.visit_type);
    row[2] = s(g.name);
    row[3] = s(g.name_kana);
    row[4] = s(g.birth_date);
    row[5] = GENDER_LABEL[s(g.gender)] ?? "";
    row[6] = s(g.postal_code);
    row[7] = s(g.address1);
    row[8] = s(g.distance_km);
    row[9] = s(g.phone);
    row[10] = s(g.email);
    row[11] = s(g.occupation);
    row[12] = s(g.contact_method);
    row[13] = v.fee != null ? Number(v.fee) : "";
    row[14] = s(v.discount);
    row[15] = s(v.repeat_date);
    row[16] = PAYMENT_LABEL[s(v.payment_method)] ?? "";
    row[17] = s(v.pro_staff);
    row[18] = s(rec.name);
    row[19] = RESULT_LABEL[result] ?? "";
    row[20] = s(v.reapproach_date);
    row[21] = s(v.note);
    row[22] = s(v.referral_source);
    row[23] = s(v.referral_source_other);
    for (let i = 0; i < 5; i++) row[24 + i] = fitting[i] ?? "";
    for (let i = 0; i < 5; i++) row[31 + i] = trial[i] ?? "";
    for (let i = 0; i < 3; i++) row[37 + i] = goals[i] ?? "";
    row[40] = s(survey.join_interest);
    row[41] = s(survey.comment);
    row[42] = v.visit_type === "trial" && result === "join" ? "入会" : "";
    row[43] = s(v.reapproach_date);
    ws.addRow(row);
  }

  // 列幅の目安
  ws.columns.forEach((col, i) => { col.width = [11, 12, 14, 14, 12, 6, 10, 28, 10, 15, 22, 16, 12][i] ?? 14; });

  // 郵便番号(7列目)・電話番号(10列目)は数値化で先頭0が消える/指数表記になるのを防ぐためテキスト書式に固定
  ws.getColumn(7).numFmt = "@";
  ws.getColumn(10).numFmt = "@";

  const buf = await wb.xlsx.writeBuffer();
  const fname = `一時利用者名簿_${from}_${to}.xlsx`;
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    },
  });
}
