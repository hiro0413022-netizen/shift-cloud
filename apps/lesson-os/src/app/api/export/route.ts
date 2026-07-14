import { NextResponse } from "next/server";
import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** CSVエクスポート（データはいつでも持ち出せる = WING NOTEの弱み対応 / DECISIONS #50） */
export async function GET(request: Request) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const kind = new URL(request.url).searchParams.get("kind") ?? "lessons";

  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  let rows: string[] = [];
  let filename = "export.csv";

  if (kind === "students") {
    const { data } = await admin
      .from("lsn_students")
      .select("name, name_kana, member_code, goal, memo, status, created_at")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("name");
    rows = [
      ["名前", "かな", "会員番号", "目標", "メモ", "状態", "登録日"].map(esc).join(","),
      ...(data ?? []).map((s) =>
        [s.name, s.name_kana, s.member_code, s.goal, s.memo, s.status, s.created_at?.slice(0, 10)].map(esc).join(",")
      ),
    ];
    filename = "students.csv";
  } else {
    const { data } = await admin
      .from("lsn_videos")
      .select("shot_at, club, distance_yd, note, is_best, created_at, student:student_id(name), staff:uploaded_by(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5000);
    rows = [
      ["生徒", "撮影日", "クラブ", "飛距離yd", "メモ", "ベスト", "担当", "登録日時"].map(esc).join(","),
      ...(data ?? []).map((v) =>
        [
          (v.student as unknown as { name: string } | null)?.name,
          v.shot_at,
          v.club,
          v.distance_yd,
          v.note,
          v.is_best ? "★" : "",
          (v.staff as unknown as { name: string } | null)?.name,
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
