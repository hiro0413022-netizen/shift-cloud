import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReserveActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, HANDEDNESS_LABEL, INTAKE_FIELDS, fmtSeq, fmtJst } from "@/lib/reserve";
import { confirmRequest, declineRequest, completeRequest, cancelRequest, saveNote } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

function val(r: Row, key: string): string {
  const v = r[key];
  if (v == null || v === "") return "—";
  if (key === "handedness") return HANDEDNESS_LABEL[String(v)] ?? String(v);
  if (key === "age") return `${v} 歳`;
  return String(v);
}

export default async function RequestDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const actor = await requireReserveActor();
  const { id } = await params;
  const sp = await searchParams;
  const admin = createAdmin();

  const { data } = await admin
    .from("res_requests")
    .select("*")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Row;
  const status = String(r.status);

  const prefs = [
    ["1", r.pref1_at],
    ["2", r.pref2_at],
    ["3", r.pref3_at],
  ].filter(([, v]) => !!v) as [string, string][];

  const mailto = r.email
    ? `mailto:${r.email}?subject=${encodeURIComponent(`【GOLF WING】${String(r.service_name ?? "ご予約")}について`)}`
    : null;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-[--color-dim] hover:text-[--color-txt]">← 一覧へ戻る</Link>

      {/* ヘッダー */}
      <div className="hud rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums text-[--color-dim]">{fmtSeq(r.request_seq as number)}</span>
              <Badge tone="accent">{String(r.service_name ?? "")}</Badge>
            </div>
            <h1 className="mt-1 text-2xl font-bold">{String(r.name)} 様</h1>
            <p className="text-sm text-[--color-dim]">{String(r.name_kana ?? "")}</p>
          </div>
          <Badge tone={STATUS_TONE[status] ?? "default"}>{STATUS_LABEL[status] ?? status}</Badge>
        </div>
        {status === "confirmed" && r.confirmed_at && (
          <p className="mt-4 rounded-xl bg-[--color-accent]/8 px-4 py-3 text-sm font-semibold text-[--color-accent]">
            確定日時：{fmtJst(r.confirmed_at as string)}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {r.phone && <a href={`tel:${r.phone}`} className="rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm">☎ {String(r.phone)}</a>}
          {mailto && <a href={mailto} className="rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm">✉ メールで返信</a>}
        </div>
      </div>

      {/* 希望日時 */}
      <div className="hud rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
        <h2 className="mb-3 text-sm font-semibold">ご希望日時（第3希望まで）</h2>
        <ol className="space-y-2">
          {prefs.map(([n, iso]) => (
            <li key={n} className="flex items-center gap-3 rounded-lg bg-[--color-panel-2] px-3 py-2 text-sm">
              <span className="rounded bg-[--color-accent]/10 px-2 py-0.5 text-xs font-semibold text-[--color-accent]">第{n}希望</span>
              <span className="font-medium">{fmtJst(iso)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 事前ヒアリング */}
      <div className="hud rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
        <h2 className="mb-3 text-sm font-semibold">事前ヒアリング</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2">
          {INTAKE_FIELDS.map(({ key, label }) => (
            <div key={key} className="flex justify-between gap-4 border-b border-[--color-line] py-2.5 text-sm">
              <dt className="shrink-0 text-[--color-dim]">{label}</dt>
              <dd className="text-right font-medium">{val(r, key)}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* 確定操作 */}
      {(status === "pending" || status === "confirmed") && (
        <div className="hud rounded-2xl border border-[--color-accent]/30 bg-[--color-panel] p-5">
          <h2 className="mb-1 text-sm font-semibold text-[--color-accent]">予約を確定する</h2>
          <p className="mb-4 text-xs text-[--color-dim]">対応可能なスタッフとフィッティング枠を確認のうえ、日時を選んで確定してください。</p>
          {sp.err === "slot" && <p className="mb-3 text-sm text-[--color-danger]">日時を選択してください。</p>}
          <form action={confirmRequest} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div className="space-y-2">
              {prefs.map(([n, iso]) => (
                <label key={n} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[--color-line] bg-white px-3 py-2.5 text-sm has-[:checked]:border-[--color-accent] has-[:checked]:bg-[--color-accent]/8">
                  <input type="radio" name="slot" value={n} defaultChecked={n === "1"} className="accent-[--color-accent]" />
                  <span className="rounded bg-[--color-panel-2] px-2 py-0.5 text-xs font-semibold">第{n}希望</span>
                  <span className="font-medium">{fmtJst(iso)}</span>
                </label>
              ))}
              <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border border-[--color-line] bg-white px-3 py-2.5 text-sm has-[:checked]:border-[--color-accent] has-[:checked]:bg-[--color-accent]/8">
                <input type="radio" name="slot" value="custom" className="accent-[--color-accent]" />
                <span className="text-[--color-dim]">別の日時で調整</span>
                <input type="datetime-local" name="custom_at" className="rounded-lg border border-[--color-line] bg-white px-2 py-1.5 text-sm" />
              </label>
            </div>
            <textarea name="message" rows={2} placeholder="お客様へのメッセージ（任意・確定メールに記載）" className="w-full rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm" />
            <textarea name="staff_note" rows={2} placeholder="社内メモ（任意）" defaultValue={String(r.staff_note ?? "")} className="w-full rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-sm text-[--color-dim]">
              <input type="checkbox" name="send_email" value="1" defaultChecked className="h-4 w-4 accent-[--color-accent]" />
              確定メールをお客様に送信する
            </label>
            <button className="w-full rounded-lg bg-[--color-accent] py-3 text-sm font-semibold text-white transition-colors hover:bg-[--color-accent-2]">
              {status === "confirmed" ? "確定内容を更新する" : "この日時で確定する"}
            </button>
          </form>
        </div>
      )}

      {/* その他ステータス操作 */}
      <div className="hud rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
        <h2 className="mb-3 text-sm font-semibold">その他の操作</h2>
        <div className="flex flex-wrap gap-2">
          {status === "confirmed" && (
            <form action={completeRequest}>
              <input type="hidden" name="id" value={id} />
              <button className="rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-sm font-medium text-emerald-700">来店完了にする</button>
            </form>
          )}
          {status !== "declined" && status !== "canceled" && status !== "completed" && (
            <>
              <form action={declineRequest}>
                <input type="hidden" name="id" value={id} />
                <button className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700">見送りにする</button>
              </form>
              <form action={cancelRequest}>
                <input type="hidden" name="id" value={id} />
                <button className="rounded-lg border border-[--color-line] bg-white px-3.5 py-2 text-sm font-medium text-[--color-dim]">キャンセル</button>
              </form>
            </>
          )}
        </div>
        {(status === "declined" || status === "canceled" || status === "completed") && (
          <form action={saveNote} className="mt-4 space-y-2">
            <input type="hidden" name="id" value={id} />
            <textarea name="staff_note" rows={2} placeholder="社内メモ" defaultValue={String(r.staff_note ?? "")} className="w-full rounded-lg border border-[--color-line] bg-white px-3 py-2 text-sm" />
            <button className="rounded-lg border border-[--color-line] bg-white px-3.5 py-2 text-sm">メモを保存</button>
          </form>
        )}
      </div>
    </div>
  );
}
