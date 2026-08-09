// lesson-fix.tsx — レッスン手当「担当プロが特定できない」をその場で直すUI
// 警告を出すだけだと money-os を探し回ることになるため、給与画面で直接修正できるようにする。
// - pro が空欄の明細  → 担当プロを選んで保存（mon_sales_lines.pro を埋める）
// - pro はあるが名簿に無い → 既存プロの別名に追加 / 新規プロとしてスタッフに紐付け
// 保存後は「集計を実行」で手当に反映される。

import { Button, Select } from "@/components/ui";
import { yen } from "@/lib/util";
import { assignLessonPro, linkLessonPro } from "./actions";

export type UnlinkedLine = {
  line_id: string;
  store_id: string;
  sold_on: string;
  customer_name: string | null;
  product_name: string | null;
  item_category: string | null;
  qty: number;
  amount: number;
  /** 台帳の担当プロ表記（正規化済み）。null = 空欄 */
  raw_pro: string | null;
  memo: string | null;
};

export type ProOption = { id: string; name: string; staff_id: string | null; payout_mode: string };
export type StaffOption = { id: string; name: string };

const PAYOUT_LABELS: Record<string, string> = {
  payroll: "給与の手当",
  outsourcing: "外注費に上乗せ",
  none: "対象外（月給など）",
};

/** 名簿に無いプロ表記を紐付ける1行 */
function UnknownProRow({
  proName,
  storeId,
  qty,
  pros,
  staff,
  ym,
}: {
  proName: string;
  storeId: string;
  qty: number;
  pros: ProOption[];
  staff: StaffOption[];
  ym: string;
}) {
  // 名簿にはあるがスタッフ未紐付け、という場合もある（別名候補から自分自身は外す）
  const self = pros.find((p) => p.name === proName);
  const aliasTargets = pros.filter((p) => p.name !== proName);
  return (
    <div className="rounded-md border border-amber-200 bg-white p-3">
      <p className="mb-2 text-sm">
        <span className="font-medium">「{proName}」</span>
        <span className="text-zinc-500">
          — {qty}件。
          {self
            ? "担当プロ名簿にはありますが、給与スタッフに紐付いていません"
            : "この表記が担当プロ名簿にありません"}
        </span>
      </p>
      <form action={linkLessonPro} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="pro_name" value={proName} />
        <input type="hidden" name="store_id" value={storeId} />
        <input type="hidden" name="ym" value={ym} />
        <label className="flex flex-col">
          <span className="mb-1 text-xs text-zinc-500">紐付け先</span>
          <Select name="target" defaultValue="" className="min-w-56">
            <option value="" disabled>選んでください</option>
            {aliasTargets.length > 0 && (
              <optgroup label="既存の担当プロの別名にする">
                {aliasTargets.map((p) => (
                  <option key={p.id} value={`alias:${p.id}`}>{p.name} の別名</option>
                ))}
              </optgroup>
            )}
            <optgroup label={self ? "このプロをスタッフに紐付ける" : "新しい担当プロとして登録"}>
              {staff.map((s) => (
                <option key={s.id} value={`staff:${s.id}`}>{s.name}</option>
              ))}
            </optgroup>
          </Select>
        </label>
        <label className="flex flex-col">
          <span className="mb-1 text-xs text-zinc-500">支払区分（スタッフに紐付ける場合）</span>
          <Select name="payout_mode" defaultValue="payroll" className="min-w-40">
            {Object.keys(PAYOUT_LABELS).map((k) => (
              <option key={k} value={k}>{PAYOUT_LABELS[k]}</option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">紐付ける</Button>
      </form>
    </div>
  );
}

/** 担当プロ空欄の明細を1行ずつ直す */
function BlankProRow({ line, pros, ym }: { line: UnlinkedLine; pros: ProOption[]; ym: string }) {
  return (
    <form
      action={assignLessonPro}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-white p-3"
    >
      <input type="hidden" name="line_id" value={line.line_id} />
      <input type="hidden" name="ym" value={ym} />
      <span className="text-sm tabular-nums text-zinc-500">{line.sold_on}</span>
      <span className="text-sm font-medium">{line.customer_name ?? "（名前なし）"}</span>
      <span className="text-sm text-zinc-500">
        {line.qty}件 / {yen(line.amount)}
        {line.memo ? `（${line.memo}）` : ""}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Select name="pro" defaultValue="" className="min-w-40">
          <option value="" disabled>担当プロを選ぶ</option>
          {pros.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
              {p.payout_mode === "none" ? "（対象外）" : p.payout_mode === "outsourcing" ? "（外注）" : ""}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">保存</Button>
      </div>
    </form>
  );
}

/**
 * 未紐付けの警告＋修正フォーム。
 * lines が空なら何も描画しない（＝警告が消える）。
 */
export function LessonUnlinkedFixer({
  lines,
  pros,
  staff,
  ym,
}: {
  lines: UnlinkedLine[];
  pros: ProOption[];
  staff: StaffOption[];
  ym: string;
}) {
  if (lines.length === 0) return null;

  const blank = lines.filter((l) => !l.raw_pro);
  // 名簿に無い表記はプロ名でまとめる（同じ表記を何度も直さなくて済むように）
  const unknown = new Map<string, { qty: number; storeId: string }>();
  for (const l of lines) {
    if (!l.raw_pro) continue;
    const cur = unknown.get(l.raw_pro);
    if (cur) cur.qty += l.qty;
    else unknown.set(l.raw_pro, { qty: l.qty, storeId: l.store_id });
  }

  return (
    <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">担当プロが特定できない売上があります（このままでは手当に反映されません）</p>
      <p className="mt-1 text-xs">
        ここで直せます。保存したあと「集計を実行」を押すと手当に反映されます。
      </p>

      <div className="mt-2 space-y-2">
        {[...unknown.entries()].map(([name, v]) => (
          <UnknownProRow
            key={name}
            proName={name}
            storeId={v.storeId}
            qty={v.qty}
            pros={pros}
            staff={staff}
            ym={ym}
          />
        ))}
        {blank.map((l) => (
          <BlankProRow key={l.line_id} line={l} pros={pros} ym={ym} />
        ))}
      </div>

      {pros.length === 0 && (
        <p className="mt-2 text-xs">
          担当プロ名簿が空です。money-os の「設定 ＞ 担当プロ」で先に登録してください。
        </p>
      )}
    </div>
  );
}
