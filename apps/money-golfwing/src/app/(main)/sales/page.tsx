import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, monthRange } from "@/lib/money";
import { Panel, Empty, yen, btnGhostCls } from "@/components/ui";
import SalesEntry, { type Preset } from "./SalesEntry";
import SalesTable, { type SaleRow } from "./SalesTable";
import RangePicker from "@/components/RangePicker";
import { resolveRange, type RangePreset } from "@/lib/table-filter";
import type { InvPick } from "./ProductPicker";

export const dynamic = "force-dynamic";

/** 定番ボタンの最大数。増やすと押し間違いが増え、探すのに一覧を目で追うことになる */
const PRESET_LIMIT = 10;

const CATEGORIES = ["利用料", "月会費", "販売", "その他"];
const MEMBER_KINDS = ["会員", "ビジター", "スタッフ"];
// 売上台帳Excelで実際に使われている決済手段に合わせる（Square 369件・金券3件の実績あり）
const PAY_METHODS = ["現金", "Airペイ", "Square", "SBペイメント", "振込", "金券", "楽天ペイ", "その他"];

type Sale = {
  id: string; sold_on: string; category: string; customer_name: string | null;
  member_kind: string | null; amount: number; tax_included: number | null;
  pay_method: string | null; memo: string | null; detail: Record<string, unknown>;
  source: string;
};

/** 台帳明細（mon_sales_lines）。過去期のExcel取込明細はここに入っている */
type LedgerLine = {
  id: string; sold_on: string; customer_name: string | null; member_kind: string | null;
  item_category: string | null; item_type: string | null; maker: string | null;
  product_name: string | null; list_price: number | string | null; discount: number | string | null;
  qty: number | string | null; amount: number | string; tax_included: number | string | null;
  pay_method: string | null; pro: string | null; memo: string | null;
};

/**
 * mon_sales のうち「月次まるめ行」のsource。
 * 中身は mon_sales_lines を月末日付で合計したもの＝明細テーブルに出すと台帳明細と二重になる。
 * 合計（PL計上）にだけ使い、明細一覧からは除外する。
 */
const AGG_SOURCES = new Set(["ledger", "migration", "slack_import"]);

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shift(y: string, n: number) { const [a, m] = y.split("-").map(Number); return ym(new Date(a, m - 1 + n, 1)); }

/** 出現頻度順にユニーク化して上位n件（サジェスト候補用） */
function uniqTop(items: string[], n: number): string[] {
  const count = new Map<string, number>();
  for (const it of items) count.set(it, (count.get(it) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
}

/** 明細の読み込み上限。これを超えると画面が重くなるので、超えたことを画面で伝える */
const ROW_LIMIT = 4000;

export default async function SalesPage({ searchParams }: {
  searchParams: Promise<{ month?: string; range?: string; from?: string; to?: string }>;
}) {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());

  // 期間（当月／3か月／6か月／今年／全期間／任意）。商品ごとの動きは1か月では見えない
  const preset: RangePreset = (["month", "3m", "6m", "year", "all", "custom"] as const)
    .includes(sp.range as RangePreset) ? (sp.range as RangePreset) : "month";
  const range = resolveRange({ preset, month, from: sp.from, to: sp.to });
  const { from, to } = range;
  /** 当月の集計（PL計上合計）は従来どおり「表示中の月」で出す */
  const cur = monthRange(month);
  /** 前月/翌月リンクで選んだ期間の条件を落とさない */
  const qs = (over: { month?: string }) => {
    const p = new URLSearchParams();
    p.set("month", over.month ?? month);
    if (preset !== "month") p.set("range", preset);
    if (preset === "custom") {
      if (sp.from) p.set("from", sp.from);
      if (sp.to) p.set("to", sp.to);
    }
    return `/sales?${p.toString()}`;
  };

  const [{ data }, { data: lineData }] = store
    ? await Promise.all([
        admin.from("mon_sales").select("*")
          .eq("company_id", actor.companyId).eq("store_id", store.id)
          .gte("sold_on", from).lt("sold_on", to).is("deleted_at", null)
          .order("sold_on", { ascending: false }).limit(ROW_LIMIT),
        // 台帳明細（Excel取込）。過去期の明細はmon_salesではなくここにある
        admin.from("mon_sales_lines")
          .select("id, sold_on, customer_name, member_kind, item_category, item_type, maker, product_name, list_price, discount, qty, amount, tax_included, pay_method, pro, memo")
          .eq("company_id", actor.companyId).eq("store_id", store.id)
          .gte("sold_on", from).lt("sold_on", to).is("deleted_at", null)
          .order("sold_on", { ascending: false }).limit(ROW_LIMIT),
      ])
    : [{ data: [] }, { data: [] }];
  const rows = (data ?? []) as Sale[];
  const ledgerLines = (lineData ?? []) as LedgerLine[];
  const truncated = rows.length >= ROW_LIMIT || ledgerLines.length >= ROW_LIMIT;
  /** PL計上合計（月次まるめ・月会費予測等を含む）。表示中の月のぶんだけ */
  const total = rows
    .filter((r) => r.sold_on >= cur.from && r.sold_on < cur.to)
    .reduce((a, r) => a + Number(r.amount), 0);
  // 「今日」はJSTで解決（UTCだと朝9時まで前日になる。#73）
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  // 担当プロ（この店舗・有効のみ。/settings で管理）
  const { data: proRows } = store
    ? await admin.from("mon_pros").select("name")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .eq("active", true).is("deleted_at", null)
        .order("sort_order").order("name")
    : { data: [] };
  const pros = (proRows ?? []).map((p) => String(p.name));

  // 在庫リスト（Inventory OS）: 品名ピッカーの選択元。理論在庫つき
  const { data: invRows } = await admin.from("inv_stock")
    .select("item_id, code, category, maker, name, variant, list_price, qty")
    .eq("company_id", actor.companyId).eq("status", "active")
    .order("code");
  const invItems: InvPick[] = (invRows ?? []).map((r) => ({
    id: String(r.item_id),
    code: String(r.code),
    category: String(r.category),
    maker: String(r.maker),
    name: String(r.name),
    variant: r.variant ? String(r.variant) : null,
    listPrice: r.list_price != null ? Number(r.list_price) : null,
    stock: Number(r.qty ?? 0),
  }));

  // 入力補助：この店舗の直近アプリ入力から品名・お客様名・定番(品名+金額)を作る
  const { data: recent } = store
    ? await admin.from("mon_sales")
        .select("category, customer_name, amount, detail, sold_on")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .eq("source", "app").is("deleted_at", null)
        .order("sold_on", { ascending: false }).limit(500)
    : { data: [] };
  const recentRows = (recent ?? []) as Pick<Sale, "category" | "customer_name" | "amount" | "detail" | "sold_on">[];

  const productSuggestions = uniqTop(
    recentRows.map((r) => String(r.detail?.product_name ?? "").trim()).filter(Boolean),
    40,
  );
  const customerSuggestions = uniqTop(
    recentRows.map((r) => String(r.customer_name ?? "").trim()).filter(Boolean),
    100,
  );

  // 種類・メーカーの候補: 売上台帳の語彙（直近800行）＋アプリ入力から。Excelと同じ言葉で入れられるように
  const { data: vocabRows } = store
    ? await admin.from("mon_sales_lines").select("item_type, maker")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .is("deleted_at", null)
        .order("sold_on", { ascending: false }).limit(800)
    : { data: [] };
  const itemTypeSuggestions = uniqTop([
    ...(vocabRows ?? []).map((r) => String(r.item_type ?? "").trim()),
    ...recentRows.map((r) => String(r.detail?.item_type ?? "").trim()),
  ].filter(Boolean), 30);
  const makerSuggestions = uniqTop([
    ...(vocabRows ?? []).map((r) => String(r.maker ?? "").trim()),
    ...recentRows.map((r) => String(r.detail?.maker ?? "").trim()),
  ].filter(Boolean), 40);
  // 販売者の候補: 直近のアプリ入力＋担当プロ
  const sellerSuggestions = uniqTop([
    ...recentRows.map((r) => String(r.detail?.seller ?? "").trim()),
    ...pros,
  ].filter(Boolean), 20);

  // 定番ボタン: 直近の入力から「よく打つ組み合わせ」を自動で並べる。
  //   - 金額は合計(amount)ではなく単価で数える。合計で数えると同じ商品が個数ごとに別の定番に割れ、
  //     押したときに定価へ合計額が入ってしまう（個数2の4,000円が「定価4,000」になる）
  //   - 並びは「打った回数の多い順」、同数なら「最近打った順」。使われなくなった組み合わせは
  //     PRESET_LIMIT の外へ自然に押し出される＝手で入れ替えなくていい
  const combos = new Map<string, { p: Preset; n: number; last: string }>();
  for (const r of recentRows) {
    const product = String(r.detail?.product_name ?? "").trim();
    if (!product) continue;
    const qty = Math.max(1, Number(r.detail?.qty) || 1);
    const unit = r.detail?.list_price != null
      ? Math.round(Number(r.detail.list_price))
      : Math.round((Number(r.amount) || 0) / qty);
    if (!unit) continue;
    const soldOn = String(r.sold_on ?? "");
    const key = `${r.category}|${product}|${unit}`;
    const cur = combos.get(key);
    if (cur) {
      cur.n += 1;
      if (soldOn > cur.last) cur.last = soldOn;
    } else {
      combos.set(key, {
        p: { label: `${product} ${unit.toLocaleString("ja-JP")}`, category: r.category, productName: product, unitPrice: unit },
        n: 1,
        last: soldOn,
      });
    }
  }
  const presets: Preset[] = [...combos.values()]
    .sort((a, b) => (b.n - a.n) || b.last.localeCompare(a.last))
    .slice(0, PRESET_LIMIT)
    .map((x) => x.p);

  // 明細（編集可能テーブルへ渡す形に整形）
  // アプリ入力(mon_sales)＋台帳明細(mon_sales_lines)を1つの一覧にする。
  // 月次まるめ行(AGG_SOURCES)は台帳明細と二重になるため一覧から除外（合計には入れる）
  const fromApp: SaleRow[] = rows
    .filter((r) => !AGG_SOURCES.has(r.source))
    .map((r) => ({
      id: r.id,
      source: "app" as const,
      soldOn: r.sold_on,
      category: r.category,
      customerName: r.customer_name ?? "",
      memberKind: r.member_kind ?? "",
      itemType: String(r.detail?.item_type ?? ""),
      maker: String(r.detail?.maker ?? ""),
      seller: String(r.detail?.seller ?? ""),
      listPrice: r.detail?.list_price != null ? Number(r.detail.list_price) : null,
      discount: r.detail?.discount != null ? Number(r.detail.discount) : null,
      amount: Number(r.amount),
      taxIncluded: r.tax_included != null ? Number(r.tax_included) : null,
      payMethod: r.pay_method ?? "",
      memo: r.memo ?? "",
      productName: String(r.detail?.product_name ?? ""),
      qty: r.detail?.qty ? Number(r.detail.qty) : null,
      pro: String(r.detail?.pro ?? ""),
      invItemId: r.detail?.inv_item_id ? String(r.detail.inv_item_id) : null,
    }));
  const fromLedger: SaleRow[] = ledgerLines.map((r) => ({
    id: `line:${r.id}`,
    source: "ledger" as const,
    soldOn: String(r.sold_on),
    category: r.item_category ?? "",
    customerName: r.customer_name ?? "",
    memberKind: r.member_kind ?? "",
    itemType: r.item_type ?? "",
    maker: r.maker ?? "",
    seller: "",
    listPrice: r.list_price != null ? Number(r.list_price) : null,
    discount: r.discount != null ? Number(r.discount) : null,
    amount: Number(r.amount) || 0,
    taxIncluded: r.tax_included != null ? Number(r.tax_included) : null,
    payMethod: r.pay_method ?? "",
    memo: r.memo ?? "",
    productName: r.product_name ?? "",
    qty: r.qty != null ? Number(r.qty) : null,
    pro: r.pro ?? "",
    invItemId: null,
  }));
  const saleRows: SaleRow[] = [...fromApp, ...fromLedger]
    .sort((a, b) => b.soldOn.localeCompare(a.soldOn));
  /** 明細合計（税抜）: 一覧に出している明細の合計 */
  const detailTotal = saleRows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">売上 — {store?.name ?? "店舗未選択"}</h1>
          <p className="text-sm text-(--color-dim)">日々の売上を入力。現金はそのまま現金出納にも反映されます</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs({ month: shift(month, -1) })} className={btnGhostCls}>← 前月</Link>
          <span className="min-w-24 text-center font-bold tabular-nums">{month}</span>
          <Link href={qs({ month: shift(month, 1) })} className={btnGhostCls}>翌月 →</Link>
          {/* 売上データ.xlsx と同じレイアウトで書き出す（そのまま既存ブックへ貼れる） */}
          <a href={`/api/sales/export?month=${month}`} className={btnGhostCls} title="この月の明細を売上データ.xlsxと同じ形式で書き出します">
            Excel出力
          </a>
        </div>
      </header>

      <Panel title="表示する期間">
        <RangePicker month={month} preset={preset} from={sp.from ?? null} to={sp.to ?? null} />
      </Panel>

      <Panel title={`売上（税抜）・${range.label}`}>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
          <div>
            <p className="text-3xl font-bold tabular-nums">{yen(detailTotal)} 円</p>
            <p className="mt-1 text-sm text-(--color-dim)">明細合計 {saleRows.length} 件（アプリ入力＋売上台帳）</p>
          </div>
          {total > 0 && (
            <div>
              <p className="text-xl font-bold tabular-nums text-(--color-dim)">{yen(total)} 円</p>
              <p className="mt-1 text-xs text-(--color-dim)">{month} の月次計上合計（月会費予測・自動計上を含む）</p>
            </div>
          )}
        </div>
        {truncated && (
          <p className="mt-2 text-xs text-(--color-accent)">
            件数が多いため最新 {ROW_LIMIT.toLocaleString("ja-JP")} 件までを読み込んでいます。期間を短くすると全件見られます
          </p>
        )}
      </Panel>

      <Panel title="売上を追加">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <SalesEntry
            today={today}
            categories={CATEGORIES}
            memberKinds={MEMBER_KINDS}
            payMethods={PAY_METHODS}
            pros={pros}
            invItems={invItems}
            productSuggestions={productSuggestions}
            customerSuggestions={customerSuggestions}
            itemTypeSuggestions={itemTypeSuggestions}
            makerSuggestions={makerSuggestions}
            sellerSuggestions={sellerSuggestions}
            presets={presets}
          />
        )}
      </Panel>

      <Panel title={`明細（${range.label}）`}>
        {saleRows.length === 0 ? (
          <Empty>この期間の売上はまだありません</Empty>
        ) : (
          <SalesTable rows={saleRows} categories={CATEGORIES} memberKinds={MEMBER_KINDS} payMethods={PAY_METHODS} pros={pros} />
        )}
      </Panel>
    </div>
  );
}
