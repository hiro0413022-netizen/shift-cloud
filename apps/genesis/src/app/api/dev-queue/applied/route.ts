import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { devQueueAuth } from "@/lib/dev-queue-auth";

/* ============================================================
   取り込み結果を書き戻す（migration 0134 / DECISIONS #183）

   成功: { id, commit_sha }        → applied_at を立てる（次から返ってこない）
   失敗: { id, error }             → status='blocked' に戻し、理由を残す
                                     （main が進んで 3way が失敗した等）

   失敗を done のまま放置すると、毎回同じパッチを取りに行って
   毎回失敗する。必ず blocked に落として人の目に留める。
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deny = devQueueAuth(req);
  if (deny) return deny;

  let body: { id?: string; commit_sha?: string; error?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const admin = createAdmin();
  const failure = String(body.error ?? "").trim();

  const patch = failure
    ? {
        status: "blocked",
        blocked_reason: `PCへの取り込みに失敗: ${failure.slice(0, 500)}`,
      }
    : {
        applied_at: new Date().toISOString(),
        commit_sha: String(body.commit_sha ?? "").slice(0, 40) || null,
      };

  const { error } = await admin.from("gn_dev_requests").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
