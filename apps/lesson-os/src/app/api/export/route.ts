import { NextResponse } from "next/server";
import { requireLessonActor, withStoreScope } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** CSVエクスポート（データはいつでも持ち出せる = WING NOTEの弱み対応 / DECISIONS #50） */
export async function GET(request: Request) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind") ?? "lessons";
  // 画面と同じ既定（退会者は出さない）。?inactive=1 で退会者も含める（2026-08-22）
  const statuses = params.get("inactive") === "1" ? ["active", "inactive"] : ["active"];

  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  let rows: string[] = [];
  let filename = "export.csv";

  if (kind === "students") {
    // CSVも店舗スコープを通す（#134。画面で隠しても持ち出せたら意味がない）
    let q = admin
      .from("lsn_students")
      .select("name, name_kana, member_code, goal, memo, status, created_at")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .in("status", statuses);
    q = withStoreScope(q, actor);
    const { data } = await q.order("name");
    rows = [
      ["名前", "かな", "会員番号", "目標", "メモ", "状態", "登録日"].map(esc).join(","),
      ...(data ?? []).map((s) =>
        [s.name, s.name_kana, s.member_code, s.goal, s.memo, s.status, s.created_at?.slice(0, 10)].map(esc).join(",")
      ),
    ];
    filename = "students.csv";
  } else {
    // lsn_videos に店舗列は無いので、まず自店舗の生徒に絞ってから動画を引く（#134）
    let sq = admin
      .from("lsn_students")
      .select("id")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .in("status", statuses);
    sq = withStoreScope(sq, actor);
    const { data: scoped } = await sq;
    const studentIds = ((scoped ?? []) as Array<{ id: string }>).map((s) => s.id);

    type VideoRow = {
      shot_at: string | null;
      club: string | null;
      distance_yd: number | null;
      note: string | null;
      is_best: boolean | null;
      created_at: string | null;
      student: { name: string } | null;
      staff: { name: string } | null;
    };
    let vids: VideoRow[] = [];
    if (studentIds.length) {
      const { data } = await admin
        .from("lsn_videos")
        .select("shot_at, club, distance_yd, note, is_best, created_at, student:student_id(name), staff:uploaded_by(name)")
        .eq("company_id", actor.companyId)
        .in("student_id", studentIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5000);
      vids = (data ?? []) as unknown as VideoRow[];
    }
    rows = [
      ["生徒", "撮影日", "クラブ", "飛距離yd", "メモ", "ベスト", "担当", "登録日時"].map(esc).join(","),
      ...vids.map((v) =>
        [
          v.student?.name,
          v.shot_at,
          v.club,
          v.distance_yd,
          v.note,
          v.is_best ? "★" : "",
          v.staff?.name,
          v.created_at,
        ].map(esc).join(",")
      ),
    ];
    filename = "lessons.csv";
  }

  // BOM付きUTF-8（Excelで文字化けしない）
  const csv = "﻿" + rows.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
