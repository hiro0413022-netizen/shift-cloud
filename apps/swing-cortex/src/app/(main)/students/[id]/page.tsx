import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { loadStudentNotes } from "@/lib/data";
import { loadFeatures } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function StudentKartePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireCoachActor();
  // 生徒カルテはproエディションのみ（販売版=standardでは非提供）
  const features = await loadFeatures(actor.companyId);
  if (!features.studentCrm) redirect("/");
  const admin = createAdmin();

  const [{ data: studentRow }, notes] = await Promise.all([
    admin.from("sc_students").select("name, name_kana").eq("company_id", actor.companyId).eq("id", id).single(),
    loadStudentNotes(actor.companyId, id),
  ]);
  const student = studentRow as { name: string; name_kana: string | null } | null;

  return (
    <div className="p-5 pb-8">
      <Link href="/" className="text-sm text-slate-400 underline underline-offset-2">← 診断へ戻る</Link>
      <div className="mt-2 mb-4">
        <h1 className="text-xl font-bold text-slate-900">{student?.name ?? "生徒"} さんのカルテ</h1>
        <div className="text-xs text-slate-400">保存したコメント {notes.length}件</div>
      </div>

      {notes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
          まだカルテがありません。診断 → コメント作成 →「カルテに保存」で記録されます。
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-2xl border border-slate-100 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{n.symptomName ?? "コメント"}</span>
                <span className="text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleDateString("ja-JP")}</span>
              </div>
              {n.natural && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{n.natural}</p>}
              {n.structured && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] text-slate-400">整形版を見る</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] leading-relaxed text-slate-600">{n.structured}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
