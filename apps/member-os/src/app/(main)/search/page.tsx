import Link from "next/link";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, inputCls, btnCls } from "@/components/ui";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import {
  mergePeople,
  KIND_LABEL,
  KIND_TONE,
  visitTypeLabel,
  resultLabel,
  paymentLabel,
  genderLabel,
  ageOf,
  fmtDay,
  type Person,
  type Hit,
} from "@/lib/visitor-search";

export const dynamic = "force-dynamic";

/**
 * 来店検索 — 「この人、前にウチに来たことある？」を1画面で答える。
 * 受付台帳は期間の一覧しかできないので、氏名・カナ・電話・メール・会員番号で過去をたどれるようにした。
 * 店舗またぎ防止(#128): 配属店舗のみ。オーナーだけ全店横断。
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  // 所属ゼロは何も見えない（受付台帳と同じ扱い）
  const storeIds = actor.isOwner
    ? null
    : actor.storeIds.length > 0
      ? actor.storeIds
      : ["00000000-0000-0000-0000-000000000000"];
  // GOLF WING会員名簿(mbr_members)は店舗列を持たない。FRANK専任には出さない
  const includeGw = actor.isOwner || actor.storeIds.some((id) => id !== FRANK_STORE_ID);

  let people: Person[] = [];
  let failed = false;
  if (q.length > 0) {
    const { data, error } = await admin.rpc("search_visitors", {
      p_company_id: actor.companyId,
      p_q: q,
      p_store_ids: storeIds,
      p_include_gw: includeGw,
      p_limit: 60,
    });
    if (error) failed = true;
    else people = mergePeople(data);
  }

  return (
    <div className="space-y-4">
      <header className="reveal">
        <h1 className="text-xl font-bold">来店検索</h1>
        <p className="text-sm text-(--color-dim)">
          過去に来店した方を、氏名・フリガナ・電話番号・メール・会員番号のどれでも探せます。
          一時利用（体験・フィッティング・打席）と会員名簿をまとめて横断します。
        </p>
      </header>

      <Panel className="d1">
        <form className="flex flex-wrap items-center gap-2">
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="例: 田中 / タナカ / 090-1234-5678 / FR0001"
            className={`${inputCls} min-w-0 flex-1 sm:max-w-md`}
          />
          <button className={btnCls}>検索</button>
          {q && (
            <Link href="/search" className="text-xs text-(--color-dim) underline hover:text-(--color-txt)">
              クリア
            </Link>
          )}
        </form>
        <p className="mt-2 text-xs text-(--color-dim)">
          電話番号はハイフンあり・なしどちらでも一致します（下4桁だけでも可）。
          同じ方の一時利用と会員の記録は、電話番号・メール・氏名＋生年月日が一致すれば1枚にまとめて表示します。
        </p>
      </Panel>

      {failed && (
        <Panel className="d2">
          <p className="text-sm text-red-600">
            検索でエラーが発生しました。時間をおいて再度お試しください（解消しない場合は管理者へご連絡ください）。
          </p>
        </Panel>
      )}

      {q.length === 0 ? (
        <Panel className="d2">
          <Empty>検索したい氏名・電話番号などを入力してください</Empty>
        </Panel>
      ) : people.length === 0 && !failed ? (
        <Panel className="d2">
          <Empty>
            「{q}」に一致する来店記録は見つかりませんでした。
            <br />
            氏名で見つからないときは電話番号の下4桁でお試しください。
          </Empty>
        </Panel>
      ) : (
        <>
          <p className="text-xs text-(--color-dim)">
            「{q}」の検索結果 {people.length} 名{people.length >= 40 ? "（上位のみ表示。絞り込んでください）" : ""}
          </p>
          <div className="space-y-3">
            {people.map((p) => (
              <PersonCard key={p.key} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PersonCard({ p }: { p: Person }) {
  const age = ageOf(p.birthDate);
  const kinds = [...new Set(p.hits.map((h) => h.kind))];
  const memberHits = p.hits.filter((h) => h.kind === "member" || h.kind === "frank");

  return (
    <section className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      {/* 見出し: 名前 + 区分バッジ + 来店回数 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-(--color-txt)">{p.name}</h2>
            {p.nameKana && <span className="text-xs text-(--color-dim)">{p.nameKana}</span>}
            {kinds.map((k) => (
              <Badge key={k} tone={KIND_TONE[k]}>
                {KIND_LABEL[k]}
              </Badge>
            ))}
          </div>
          <p className="mt-1 text-xs text-(--color-dim)">
            {[
              p.phone,
              p.email,
              p.birthDate ? `${fmtDay(p.birthDate)}生${age != null ? `（${age}歳）` : ""}` : null,
              genderLabel(p.gender),
              p.address,
            ]
              .filter(Boolean)
              .join(" ・ ") || "連絡先の登録なし"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums text-indigo-600">
            {p.visitCount}
            <span className="ml-1 text-sm font-normal text-(--color-dim)">回</span>
          </p>
          <p className="text-[11px] text-(--color-dim)">
            {p.firstVisit ? `初回 ${fmtDay(p.firstVisit)}` : "来店記録なし"}
            {p.lastVisit ? ` / 最終 ${fmtDay(p.lastVisit)}` : ""}
          </p>
        </div>
      </div>

      {p.alertNote && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠ 重要事項: {p.alertNote}
        </p>
      )}

      {/* 会員としての情報 */}
      {memberHits.length > 0 && (
        <div className="mt-3 space-y-1">
          {memberHits.map((h) => (
            <MemberLine key={`${h.kind}:${h.id}`} h={h} />
          ))}
        </div>
      )}

      {p.note && <p className="mt-2 text-xs text-(--color-dim)">メモ: {p.note}</p>}

      {/* 来店履歴 */}
      <div className="mt-4">
        {p.visits.length === 0 ? (
          <p className="text-xs text-(--color-dim)">
            この店舗での来店記録はありません（名簿にのみ登録されています）。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="text-(--color-dim)">
                <tr className="border-b border-(--color-line)">
                  <th className="py-1.5 pr-3 font-medium">来店日</th>
                  <th className="py-1.5 pr-3 font-medium">区分</th>
                  <th className="py-1.5 pr-3 font-medium">店舗</th>
                  <th className="py-1.5 pr-3 font-medium">料金</th>
                  <th className="py-1.5 pr-3 font-medium">担当</th>
                  <th className="py-1.5 pr-3 font-medium">結果</th>
                  <th className="py-1.5 font-medium">備考</th>
                </tr>
              </thead>
              <tbody>
                {p.visits.map((v, i) => {
                  const res = resultLabel(v.result);
                  const pay = paymentLabel(v.payment);
                  return (
                    <tr key={`${v.date}-${i}`} className="border-b border-(--color-line)/60 last:border-0">
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        <Link
                          href={`/?from=${String(v.date ?? "").slice(0, 10)}&to=${String(v.date ?? "").slice(0, 10)}`}
                          className="text-indigo-600 underline-offset-2 hover:underline"
                        >
                          {fmtDay(v.date)}
                        </Link>
                        {v.start && <span className="ml-1 text-(--color-dim)">{String(v.start).slice(0, 5)}</span>}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{visitTypeLabel(v.type)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-(--color-dim)">{v.store ?? "—"}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                        {v.fee != null ? `¥${Number(v.fee).toLocaleString("ja-JP")}` : "—"}
                        {pay && <span className="ml-1 text-(--color-dim)">{pay}</span>}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap text-(--color-dim)">
                        {v.pro || v.staff || "—"}
                      </td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        {res ? <Badge tone="ok">{res}</Badge> : <span className="text-(--color-dim)">—</span>}
                      </td>
                      <td className="py-1.5 text-(--color-dim)">{v.note || v.discount || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function MemberLine({ h }: { h: Hit }) {
  const parts = [
    h.member_no ? `会員番号 ${h.member_no}` : null,
    h.member_type,
    h.class_name,
    h.plan,
    h.status,
    h.join_date ? `入会 ${fmtDay(h.join_date)}` : null,
    h.leave_date ? `退会 ${fmtDay(h.leave_date)}${h.leave_reason ? `（${h.leave_reason}）` : ""}` : null,
    h.kind === "member" && h.last_visit ? `名簿の最終来店 ${fmtDay(h.last_visit)}` : null,
    h.kind === "member" && h.monthly_visits != null ? `今月 ${h.monthly_visits}回` : null,
  ].filter(Boolean);
  return (
    <p className="text-xs text-(--color-dim)">
      <span className="mr-2 font-medium text-(--color-txt)">{KIND_LABEL[h.kind]}</span>
      {parts.join(" ・ ")}
    </p>
  );
}
