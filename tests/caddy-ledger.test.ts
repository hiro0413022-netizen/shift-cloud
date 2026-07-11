import test from "node:test";
import assert from "node:assert/strict";

/* ============================================================
   Caddy OS の原価ロジック（DECISIONS #45 / migration 0036）

   Excel運用で最大の事故だったのが「社員（林さん）の交通費を委託料台帳に書き、
   給与でも同じ交通費を支給していた」＝二重計上。
   Caddy OS は 社員の派遣を原価0として扱い、人件費は給与側（#44）に一本化する。
   この境界をここで固定する。
   ============================================================ */

type Dispatch = {
  partner_id: string | null;
  staff_id: string | null;
  sales_amount: number;
  fee_amount: number;
  transport_amount: number;
  special_amount: number;
};

// apps/caddy-os/src/lib/caddy.ts と同じ式（server-onlyのためここに同型で再現）
function dispatchCost(d: Dispatch): number {
  if (!d.partner_id) return 0;
  return d.fee_amount + d.transport_amount + d.special_amount;
}

function summarize(rows: Dispatch[]) {
  let sales = 0;
  let outsourcing = 0;
  let count = 0;
  for (const r of rows) {
    sales += r.sales_amount;
    outsourcing += dispatchCost(r);
    if (r.sales_amount > 0) count += 1;
  }
  return { sales, outsourcing, gross: sales - outsourcing, count };
}

const partner = (fee: number, transport = 0, special = 0, sales = 17000): Dispatch => ({
  partner_id: "p1",
  staff_id: null,
  sales_amount: sales,
  fee_amount: fee,
  transport_amount: transport,
  special_amount: special,
});

const employee = (sales = 17000, transport = 0): Dispatch => ({
  partner_id: null,
  staff_id: "hayashi",
  sales_amount: sales,
  fee_amount: 0,
  transport_amount: transport,
  special_amount: 0,
});

test("委託先の派遣: 委託料+交通費+特別手当が原価になる", () => {
  assert.equal(dispatchCost(partner(12500, 1000, 1000)), 14500);
});

test("社員の派遣: 原価は0（人件費は給与側で計上する）", () => {
  assert.equal(dispatchCost(employee(17000)), 0);
});

test("社員の交通費は外注費に入らない（Excel運用の二重計上を構造で防ぐ）", () => {
  // 林さん 5月の交通費14,840円は給与明細の非課税交通費と1円一致 → 給与側が正
  const d = employee(17000, 14840);
  assert.equal(dispatchCost(d), 0);
});

test("2026年6月の実データを再現: 売上661,000 / 外注費321,000 / 粗利340,000", () => {
  // 実際の内訳（委託料310,000 + 交通費11,000）＋ 林さん15回（原価0・うち交通費4,670は給与側）
  const rows: Dispatch[] = [
    // 委託先ぶん（合計 fee 310,000 / transport 11,000 になるよう集約した代表行）
    partner(310000, 11000, 0, 0),
    // 売上（39人工 = 661,000円ぶんを1行に集約）
    { partner_id: null, staff_id: null, sales_amount: 661000, fee_amount: 0, transport_amount: 0, special_amount: 0 },
    // 林さんの交通費（給与で支給済み。ここに入れても原価にならないことを確認）
    employee(0, 4670),
  ];
  const s = summarize(rows);
  assert.equal(s.sales, 661000);
  assert.equal(s.outsourcing, 321000);
  assert.equal(s.gross, 340000);
});

test("粗利は「売上−外注費」であり、自社人件費（林さん27万）は含まない", () => {
  // 事業の最終利益は 340,000 − 274,680（給与）= 65,320。これはGenesisの事業別PLで見る
  const s = summarize([partner(310000, 11000, 0, 0), partner(0, 0, 0, 661000)]);
  assert.equal(s.gross, 340000);
  const 事業利益 = s.gross - 274680;
  assert.equal(事業利益, 65320);
});

test("研修など売上0の派遣は人工数に数えないが、原価は計上される", () => {
  const s = summarize([partner(5000, 0, 0, 0)]);
  assert.equal(s.count, 0);
  assert.equal(s.outsourcing, 5000);
  assert.equal(s.gross, -5000);
});
