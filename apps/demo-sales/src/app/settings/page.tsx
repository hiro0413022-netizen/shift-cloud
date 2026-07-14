import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { OPTION_CATEGORIES, yen } from "@/lib/quote";
import { savePlan, saveOption, deleteOption, saveQuoteSettings } from "@/app/quote-actions";

export const dynamic = "force-dynamic";

type Plan = {
  key: string;
  name: string;
  build_price: number;
  monthly_fee: number;
  pages: string | null;
  features: string[] | null;
  sort: number;
  active: boolean;
};
type Option = {
  key: string;
  name: string;
  category: string;
  description: string | null;
  build_price: number;
  monthly_fee: number;
  unit: string;
  default_qty: number;
  recommended: boolean;
  sort: number;
  active: boolean;
};

export default async function SettingsPage() {
  const actor = await requireActor();
  const admin = createAdmin();

  const [{ data: plans }, { data: options }, { data: st }] = await Promise.all([
    admin.from("dms_plans").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("dms_options").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("dms_quote_settings").select("*").eq("company_id", actor.companyId).maybeSingle(),
  ]);

  const planRows = (plans ?? []) as Plan[];
  const optRows = (options ?? []) as Option[];

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <Link href="/" className="text-xs text-(--color-dim) hover:text-(--color-txt)">← 営業司令へ戻る</Link>
        <h1 className="text-2xl font-bold">料金・見積の設定</h1>
        <p className="text-sm text-(--color-dim)">
          ここで変更した金額が、営業先ページの見積作成・見積書にそのまま反映されます（金額はすべて税抜）。
        </p>
      </header>

      {/* 基本プラン */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold">基本プラン</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {planRows.map((p) => (
            <form key={p.key} action={savePlan} className="grid gap-2 rounded-lg border border-(--color-line) p-3 text-sm">
              <input type="hidden" name="key" value={p.key} />
              <input name="name" defaultValue={p.name} className={inputCls} />
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-(--color-dim)">初期費用（税抜）
                  <input name="build_price" defaultValue={p.build_price} className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">月額（税抜）
                  <input name="monthly_fee" defaultValue={p.monthly_fee} className={inputCls} />
                </label>
                <label className="text-xs text-(--color-dim)">ページ数
                  <input name="pages" defaultValue={p.pages ?? ""} className={inputCls} />
                </label>
              </div>
              <label className="text-xs text-(--color-dim)">含まれる内容（1行1件）
                <textarea name="features" rows={4} defaultValue={(p.features ?? []).join("\n")} className={inputCls} />
              </label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-(--color-dim)">
                  <input type="checkbox" name="active" defaultChecked={p.active} /> 有効
                </label>
                <input name="sort" defaultValue={p.sort} className={`${inputCls} w-20`} />
                <button className={btnCls}>保存</button>
              </div>
            </form>
          ))}

          {/* プラン追加 */}
          <form action={savePlan} className="grid gap-2 rounded-lg border border-dashed border-(--color-line) p-3 text-sm">
            <p className="text-xs font-semibold text-(--color-dim)">プランを追加</p>
            <div className="grid grid-cols-2 gap-2">
              <input name="key" placeholder="キー（例: premium）" className={inputCls} required />
              <input name="name" placeholder="プラン名" className={inputCls} required />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input name="build_price" placeholder="初期費用" className={inputCls} />
              <input name="monthly_fee" placeholder="月額" className={inputCls} />
              <input name="pages" placeholder="ページ数" className={inputCls} />
            </div>
            <textarea name="features" rows={3} placeholder="含まれる内容（1行1件）" className={inputCls} />
            <label className="flex items-center gap-1 text-xs text-(--color-dim)">
              <input type="checkbox" name="active" defaultChecked /> 有効
            </label>
            <button className={`${btnCls} w-fit`}>追加</button>
          </form>
        </div>
      </section>

      {/* オプション */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-1 font-semibold">オプション（{optRows.length}件）</h2>
        <p className="mb-3 text-xs text-(--color-dim)">
          「おすすめ」を付けたオプションは、見積作成画面で最初からチェックが入ります。
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                <th className="py-2 pr-2">品名 / 摘要</th>
                <th className="py-2 pr-2">分類</th>
                <th className="py-2 pr-2">初期（税抜）</th>
                <th className="py-2 pr-2">月額（税抜）</th>
                <th className="py-2 pr-2">単位</th>
                <th className="py-2 pr-2">おすすめ</th>
                <th className="py-2 pr-2">有効</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {optRows.map((o) => (
                <tr key={o.key} className="border-b border-(--color-line) align-top">
                  <td colSpan={8} className="py-2">
                    <form action={saveOption} className="grid gap-2 md:grid-cols-12 md:items-center">
                      <input type="hidden" name="key" value={o.key} />
                      <div className="md:col-span-4">
                        <input name="name" defaultValue={o.name} className={inputCls} />
                        <input name="description" defaultValue={o.description ?? ""} placeholder="摘要" className={`${inputCls} mt-1 text-xs`} />
                      </div>
                      <select name="category" defaultValue={o.category} className={`${inputCls} md:col-span-2`}>
                        {Object.entries(OPTION_CATEGORIES).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <input name="build_price" defaultValue={o.build_price} className={`${inputCls} md:col-span-1`} />
                      <input name="monthly_fee" defaultValue={o.monthly_fee} className={`${inputCls} md:col-span-1`} />
                      <input name="unit" defaultValue={o.unit} className={`${inputCls} md:col-span-1`} />
                      <input type="hidden" name="default_qty" value={o.default_qty} />
                      <input type="hidden" name="sort" value={o.sort} />
                      <label className="flex items-center gap-1 text-xs text-(--color-dim) md:col-span-1">
                        <input type="checkbox" name="recommended" defaultChecked={o.recommended} /> 推奨
                      </label>
                      <label className="flex items-center gap-1 text-xs text-(--color-dim) md:col-span-1">
                        <input type="checkbox" name="active" defaultChecked={o.active} /> 有効
                      </label>
                      <div className="flex gap-2 md:col-span-1">
                        <button className={`${btnCls} px-3 py-1.5`}>保存</button>
                      </div>
                    </form>
                    <form action={deleteOption.bind(null, o.key)} className="mt-1">
                      <button className="text-xs text-(--color-danger) hover:underline">このオプションを削除</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form action={saveOption} className="mt-4 grid gap-2 rounded-lg border border-dashed border-(--color-line) p-3 text-sm md:grid-cols-12 md:items-center">
          <p className="text-xs font-semibold text-(--color-dim) md:col-span-12">オプションを追加</p>
          <input name="key" placeholder="キー（例: movie）" className={`${inputCls} md:col-span-2`} required />
          <input name="name" placeholder="品名（例: 紹介動画制作）" className={`${inputCls} md:col-span-3`} required />
          <select name="category" className={`${inputCls} md:col-span-2`}>
            {Object.entries(OPTION_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input name="build_price" placeholder="初期費用" className={`${inputCls} md:col-span-1`} />
          <input name="monthly_fee" placeholder="月額" className={`${inputCls} md:col-span-1`} />
          <input name="unit" placeholder="単位" defaultValue="式" className={`${inputCls} md:col-span-1`} />
          <label className="flex items-center gap-1 text-xs text-(--color-dim) md:col-span-1">
            <input type="checkbox" name="active" defaultChecked /> 有効
          </label>
          <input name="description" placeholder="摘要（見積書に出ます）" className={`${inputCls} md:col-span-11`} />
          <button className={`${btnCls} md:col-span-1`}>追加</button>
        </form>
      </section>

      {/* 見積書の発行元 */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold">見積書の発行元・既定値</h2>
        <form action={saveQuoteSettings} className="grid gap-2 text-sm lg:grid-cols-2">
          <label className="text-xs text-(--color-dim)">発行元名
            <input name="issuer_name" defaultValue={st?.issuer_name ?? "株式会社YOZAN"} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">住所
            <input name="issuer_address" defaultValue={st?.issuer_address ?? ""} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">電話
            <input name="issuer_tel" defaultValue={st?.issuer_tel ?? ""} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">メール
            <input name="issuer_email" defaultValue={st?.issuer_email ?? ""} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">消費税率（%）
            <input name="tax_percent" defaultValue={Math.round(Number(st?.tax_rate ?? 0.1) * 100)} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">見積有効期限（日）
            <input name="valid_days" defaultValue={st?.valid_days ?? 30} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim) lg:col-span-2">お支払い条件・振込先など
            <textarea name="issuer_note" rows={2} defaultValue={st?.issuer_note ?? ""} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim) lg:col-span-2">見積書末尾の注記
            <textarea name="footer_note" rows={2} defaultValue={st?.footer_note ?? ""} className={inputCls} />
          </label>
          <button className={`${btnCls} w-fit lg:col-span-2`}>保存</button>
        </form>
      </section>

      <p className="mt-6 text-xs text-(--color-dim)">
        参考: 現在のプラン最安 {planRows.length ? yen(Math.min(...planRows.map((p) => p.build_price))) : "—"} ／ オプション有効
        {optRows.filter((o) => o.active).length}件
      </p>
    </main>
  );
}
