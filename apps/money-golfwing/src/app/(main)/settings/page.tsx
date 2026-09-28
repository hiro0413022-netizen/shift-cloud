import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore } from "@/lib/money";
import { Panel, Empty, Badge, inputCls, btnCls } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { addPro, toggleProActive, updateProOrder, deletePro, updateProPayroll } from "./actions";

export const dynamic = "force-dynamic";

type Pro = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  staff_id: string | null;
  aliases: string[] | null;
  payout_mode: "payroll" | "outsourcing" | "none";
};
type Staff = { id: string; name: string };

/** 支払区分の表示名（DECISIONS #105） */
const PAYOUT_LABELS: Record<Pro["payout_mode"], string> = {
  payroll: "給与の手当",
  outsourcing: "外注費に上乗せ",
  none: "対象外",
};

type LessonCount = { pro_name: string; staff_id: string | null; staff_name: string | null; payout_mode: Pro["payout_mode"]; qty: number; sales_amount: number };
const LESSON_UNIT = 2000; // shift-cloud lib/lesson-allowance.ts の PERSONAL_LESSON_UNIT_PRICE と同じ

export default async function SettingsPage() {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);

  const [{ data }, { data: staffRows }] = await Promise.all([
    store
      ? admin.from("mon_pros")
          .select("id, name, sort_order, active, staff_id, aliases, payout_mode")
          .eq("company_id", actor.companyId).eq("store_id", store.id)
          .is("deleted_at", null)
          .order("sort_order").order("name")
      : Promise.resolve({ data: [] }),
    admin.from("staff")
      .select("id, name")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .order("name"),
  ]);
  const pros = (data ?? []) as Pro[];
  const staff = (staffRows ?? []) as Staff[];

  // 給与に入るパーソナル件数（#286）。給与の「集計を実行」と同じDB関数を読む＝ここと給与の数字は必ず一致する
  const jst = new Date(Date.now() + 9 * 3600_000);
  const monthsToShow = [0, -1].map((off) => {
    const d = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + off, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return { ym, from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
  });
  const lessonCounts = await Promise.all(
    monthsToShow.map(async (m) => {
      const { data: rows } = await admin.rpc("personal_lesson_counts", { p_company_id: actor.companyId, p_from: m.from, p_to: m.to });
      return { ...m, rows: (rows ?? []) as LessonCount[] };
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="担当プロの設定"
        store={store?.name ?? "店舗未選択"}
        lead="この店舗のプロ（コーチ）を登録します。売上を入れるときの「担当プロ」に出てきます。辞めた人は消さずに「無効」にしてください（過去の売上の名前が残ります）。"
      />

      <Panel title="担当プロを追加">
        {!store ? (
          <Empty>店舗が選択されていません。メニューの店舗から選んでください</Empty>
        ) : (
          <form action={addPro} className="flex flex-wrap items-center gap-2">
            <input name="name" placeholder="名前（例: 山田プロ）" required className={`${inputCls} max-w-60`} />
            <input name="sort_order" inputMode="numeric" placeholder="並び順(小=上)" className={`${inputCls} max-w-32`} />
            <button className={btnCls}>追加</button>
          </form>
        )}
      </Panel>

      <Panel title={`担当プロ（${pros.length}名）`}>
        {pros.length === 0 ? (
          <Empty>まだ登録がありません。上のフォームから追加してください</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                <th className="py-2 pr-2 text-left font-medium">名前</th>
                <th className="px-2 py-2 text-left font-medium">状態</th>
                <th className="px-2 py-2 text-left font-medium">並び順</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pros.map((p) => (
                <tr key={p.id} className="border-b border-(--color-line)">
                  <td className="py-2 pr-2 font-medium">{p.name}</td>
                  <td className="px-2 py-2">
                    <Badge tone={p.active ? "ok" : "dim"}>{p.active ? "有効" : "無効"}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <form action={updateProOrder} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="sort_order" defaultValue={p.sort_order} inputMode="numeric" className={`${inputCls} w-20 py-1`} />
                      <button className="text-xs text-(--color-dim) hover:text-(--color-gold)">保存</button>
                    </form>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <form action={toggleProActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={String(!p.active)} />
                        <button className="text-xs text-(--color-dim) hover:text-(--color-gold)">
                          {p.active ? "無効にする" : "有効に戻す"}
                        </button>
                      </form>
                      <form action={deletePro}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-(--color-dim)">
          無効＝退任など。新しい売上の選択肢から外れますが、過去の明細はそのまま残ります。
        </p>
      </Panel>

      <Panel title="給与連携（パーソナルレッスン手当）">
        <p className="mb-3 text-xs text-(--color-dim)">
          売上の「パーソナルレッスン25分」（この画面で入れた売上・売上台帳の両方）から、担当プロごとに手当（1件2,000円）を自動計算します。
          給与（Shift Cloud）で「集計を実行」したときに、下の件数がそのまま給与・外注費に入ります。
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))]">
          {lessonCounts.map((m) => {
            const total = m.rows.reduce((a, r) => a + r.qty, 0);
            return (
              <div key={m.ym} className="rounded-lg border border-(--color-line) p-3">
                <p className="mb-2 text-sm font-bold">
                  {Number(m.ym.slice(0, 4))}年{Number(m.ym.slice(5))}月のパーソナル　<span className="font-normal text-(--color-dim)">計 {total}件</span>
                </p>
                {m.rows.length === 0 ? (
                  <p className="text-sm text-(--color-dim)">まだありません</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                        <th className="py-1 text-left font-medium">担当</th>
                        <th className="py-1 text-right font-medium">件数</th>
                        <th className="py-1 text-right font-medium">手当</th>
                        <th className="py-1 pl-2 text-left font-medium">どこに入るか</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.rows.map((r, i) => (
                        <tr key={i} className="border-b border-(--color-line) last:border-0">
                          <td className="py-1.5">{r.staff_name ?? r.pro_name}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                          <td className="py-1.5 text-right tabular-nums">{r.payout_mode === "none" || !r.staff_id ? "—" : `${(Math.max(0, r.qty) * LESSON_UNIT).toLocaleString("ja-JP")}円`}</td>
                          <td className="py-1.5 pl-2">
                            {!r.staff_id ? (
                              <Badge tone="accent">担当が分からない（給与画面で直せます）</Badge>
                            ) : (
                              <Badge tone={r.payout_mode === "payroll" ? "ok" : r.payout_mode === "outsourcing" ? "gold" : "dim"}>{PAYOUT_LABELS[r.payout_mode]}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        {pros.length === 0 ? (
          <Empty>担当プロが登録されていません</Empty>
        ) : (
          <div className="space-y-3">
            {pros.map((p) => (
              <form
                key={p.id}
                action={updateProPayroll}
                className="flex flex-wrap items-end gap-2 border-b border-(--color-line) pb-3"
              >
                <input type="hidden" name="id" value={p.id} />

                <div className="w-24 shrink-0">
                  <p className="text-xs text-(--color-dim)">担当プロ</p>
                  <p className="py-1 font-medium">{p.name}</p>
                </div>

                <label className="flex flex-col">
                  <span className="text-xs text-(--color-dim)">スタッフ</span>
                  <select name="staff_id" defaultValue={p.staff_id ?? ""} className={`${inputCls} max-w-44`}>
                    <option value="">（紐付けなし）</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col">
                  <span className="text-xs text-(--color-dim)">支払区分</span>
                  <select name="payout_mode" defaultValue={p.payout_mode} className={`${inputCls} max-w-44`}>
                    {(Object.keys(PAYOUT_LABELS) as Pro["payout_mode"][]).map((k) => (
                      <option key={k} value={k}>{PAYOUT_LABELS[k]}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col">
                  <span className="text-xs text-(--color-dim)">別名・表記ゆれ</span>
                  <input
                    name="aliases"
                    defaultValue={(p.aliases ?? []).join("、")}
                    placeholder="例: 春馬"
                    className={`${inputCls} max-w-44`}
                  />
                </label>

                <button className={btnCls}>保存</button>
              </form>
            ))}
          </div>
        )}

        <ul className="mt-3 space-y-1 text-xs text-(--color-dim)">
          <li>
            <b>給与の手当</b>＝給与明細に手当として載る／<b>外注費に上乗せ</b>＝業務委託の方。給与ではなく経費（外注）に自動計上／
            <b>対象外</b>＝月給・役員報酬などで手当を付けない
          </li>
          <li>スタッフを紐付けないと手当に取り込まれません（給与画面に警告が出ます）</li>
          <li>別名は売上台帳の「担当プロ」欄の表記ゆれを吸収します。読点かスペースで区切って複数登録できます</li>
        </ul>
      </Panel>
    </div>
  );
}
