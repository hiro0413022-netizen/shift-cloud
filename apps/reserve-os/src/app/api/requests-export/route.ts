import { requireReserveActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { STATUS_LABEL, HANDEDNESS_LABEL, fmtJst, fmtSeq } from "@/lib/reserve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const HEADERS = [
  "受付番号", "ステータス", "サービス", "申込日時",
  "氏名", "ふりがな", "電話番号", "メール", "利き手", "年齢", "平均スコア",
  "ヘッドスピード", "ゴルフ歴", "メーカー", "モデル", "シャフト名", "フレックス",
  "現在の悩み", "改善したいこと", "飛距離", "持ち込み予定クラブ", "その他相談",
  "第1希望", "第2希望", "第3希望", "確定日時", "社内メモ",
];

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  const actor = await requireReserveActor();
  const admin = createAdmin();
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "";

  let q = admin
    .from("res_requests")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (["pending", "confirmed", "declined", "canceled", "completed"].includes(status)) q = q.eq("status", status);

  const { data } = await q;
  const rows = (data ?? []) as Row[];

  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const cells = [
      fmtSeq(r.request_seq as number),
      STATUS_LABEL[String(r.status)] ?? String(r.status),
      r.service_name, fmtJst(r.created_at as string),
      r.name, r.name_kana, r.phone, r.email,
      HANDEDNESS_LABEL[String(r.handedness)] ?? "", r.age, r.avg_score,
      r.head_speed, r.golf_experience, r.club_maker, r.club_model, r.club_shaft, r.club_flex,
      r.concern, r.improvement, r.target_distance, r.bring_clubs, r.other_notes,
      fmtJst(r.pref1_at as string), fmtJst(r.pref2_at as string), fmtJst(r.pref3_at as string),
      r.confirmed_at ? fmtJst(r.confirmed_at as string) : "", r.staff_note,
    ];
    lines.push(cells.map(csvCell).join(","));
  }

  // Excel/スプレッドシートで文字化けしないよう UTF-8 BOM を付与
  const body = "﻿" + lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);
  const fname = `予約申込一覧_${today}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    },
  });
}
