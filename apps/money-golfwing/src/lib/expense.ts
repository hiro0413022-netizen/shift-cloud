// expense.ts — 経費入力の「選択肢」と「あとで何が起きるか」の判定（純粋ロジック・#191）
// DBアクセス禁止・server-only禁止。tests/expense-input.test.ts から直接importしてテストする。
//
// なぜ純関数に切り出すか:
//   支払い方法によって **帳簿のどこが動くか** が変わる。ここを画面のJSXに散らすと、
//   「現金で払ったのにレジの残高が合わない」「振込分が二重に計上される」が静かに起きる。
//   何が起きるかを1か所で決めて、画面はその結果を表示するだけにする。

/** 支払い方法（ユーザー確定 2026-09-01: この3つをスタッフが入力する） */
export const PAY_METHODS = [
  {
    value: "cash",
    label: "店の現金",
    hint: "レジ・小口から支払った",
    /** 店の現金が減る＝現金出納にも出金を書かないとレジが合わなくなる */
    movesCash: true,
    /** 銀行・カードの明細には出てこない＝消込は不要 */
    needsSettle: false,
  },
  {
    value: "advance",
    label: "立替",
    hint: "自分のお金で払った（あとで精算）",
    movesCash: false,
    // 精算を振込でしたときだけ銀行に出る。現金で返したときは出ない。
    needsSettle: false,
  },
  {
    value: "credit",
    label: "掛け（後日振込）",
    hint: "まだ払っていない・後日振込",
    movesCash: false,
    needsSettle: true,
  },
] as const;

export type PayMethod = (typeof PAY_METHODS)[number]["value"];

export function payMethod(value: unknown) {
  return PAY_METHODS.find((m) => m.value === String(value ?? "")) ?? null;
}

export function payMethodLabel(value: unknown): string {
  return payMethod(value)?.label ?? String(value ?? "");
}

/**
 * 科目のボタン（ユーザー確定: よく使うものだけ出す）。
 * value は `mon_category_map(src_kind='expense')` に登録されている表記に合わせる。
 * ここに無い表記を入れると集計側で「その他経費」に落ちる（壊れはしないが意図しない科目になる）。
 */
export const EXPENSE_CATEGORIES = [
  { value: "仕入", hint: "商品・材料（納品書）" },
  { value: "備品", hint: "消耗品・備品" },
  { value: "水道光熱費", hint: "電気・ガス・水道" },
  { value: "広告", hint: "チラシ・広告費" },
  { value: "送料", hint: "配送料・宅配便" },
  { value: "支払手数料", hint: "振込手数料など" },
  { value: "その他経費", hint: "上のどれでもない" },
] as const;

/** 科目が未設定（＝「わからない」で登録された）行か */
export function isCategoryUnset(category: unknown): boolean {
  return String(category ?? "").trim() === "";
}

export type ExpenseEffect = {
  /** 現金出納に出金を書くか */
  writeCashOut: boolean;
  /** 入力者に見せる一言（この操作で帳簿がどうなるか） */
  note: string;
  /** 本部の作業が残るか（残るなら一覧に出す） */
  pending: null | "settle" | "reimburse";
};

/** 保存したときに帳簿で何が起きるかを決める（画面の説明文もここから出す） */
export function expenseEffect(method: unknown): ExpenseEffect {
  switch (String(method ?? "")) {
    case "cash":
      return {
        writeCashOut: true,
        note: "経費に計上し、現金出納にも出金として記録します（レジの残高が合うように）。",
        pending: null,
      };
    case "advance":
      return {
        writeCashOut: false,
        note: "経費に計上します。店のお金は動いていないので現金出納は変わりません。精算するまで「立替の精算待ち」に残ります。",
        pending: "reimburse",
      };
    case "credit":
      return {
        writeCashOut: false,
        note: "経費に計上します。後日の振込は「カード・口座取込」の消込で結んでください（結ばないと支払いが二重に計上されます）。",
        pending: "settle",
      };
    default:
      return { writeCashOut: false, note: "支払い方法を選んでください。", pending: null };
  }
}

/** 入力を弾く理由（無ければ null）。画面とサーバーの両方で通す */
export function expenseInputError(input: {
  spentOn?: unknown;
  amount?: unknown;
  item?: unknown;
  method?: unknown;
  paidBy?: unknown;
}): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.spentOn ?? ""))) return "日付を選んでください";
  const amount = Number(input.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "金額を入れてください";
  if (String(input.item ?? "").trim() === "") return "品名（何を買ったか）を入れてください";
  if (!payMethod(input.method)) return "支払い方法を選んでください";
  if (String(input.method) === "advance" && String(input.paidBy ?? "").trim() === "") {
    return "立替えた方のお名前を入れてください";
  }
  return null;
}
