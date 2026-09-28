/**
 * Tool の出力 → Block インスタンス（P1・Final Architecture §8）
 *
 * Tool は「業務の形」で返す（rows / count / date …）。Block は「見せる形」。
 * その橋渡しをここに集める。Block ごとの adapter は小さく、合わなければ Table / SourceNote に落として壊さない。
 */
import type { BlockRegistry, BlockInstance, BlockMeta } from "./blocks.ts";
import type { ExecutionResult } from "./execute.ts";

type Row = Record<string, unknown>;
const prevDay = (ymd: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(ymd) ? new Date(Date.parse(`${ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : ymd);
const asRows = (o: Row): Row[] => (Array.isArray(o.rows) ? (o.rows as Row[]) : Array.isArray(o.items) ? (o.items as Row[]) : []);

const ADAPTERS: Record<string, (o: Row, ref: string) => Row> = {
  Table: (o) => {
    const rows = asRows(o);
    return { title: String(o.title ?? ""), columns: rows.length ? Object.keys(rows[0]) : [], rows };
  },
  BookingList: (o) => ({ date: String(o.date ?? ""), items: asRows(o) }),
  // to は排他境界なので、見せるときは前日（1日分なら from と同じ日）
  ShiftGrid: (o) => ({ from: String(o.from ?? ""), to: prevDay(String(o.to ?? "")), rows: asRows(o) }),
  Summary: (o) => ({ title: String(o.title ?? ""), items: asRows(o) }),
  Timeline: (o) => ({ entity: String(o.entity ?? ""), items: asRows(o) }),
  Health: (o) => ({ items: asRows(o), ok: !!o.ok }),
  KPI: (o, ref) => {
    if (ref.startsWith("sales.daily")) return { label: `${o.date} の売上`, value: Number(o.total ?? 0), unit: "円", target: null, delta: o.prev_total == null ? null : Number(o.total ?? 0) - Number(o.prev_total), drill: "/finance" };
    if (ref.startsWith("sales.month")) return { label: `${String(o.from ?? "").slice(0, 7)} の売上`, value: Number(o.total ?? 0), unit: "円", target: o.target == null ? null : Number(o.target), delta: null, drill: "/finance" };
    return { label: ref, value: Number(o.value ?? o.total ?? o.count ?? 0), unit: String(o.unit ?? ""), target: null, delta: null };
  },
  EntityCard: (o, ref) => {
    if (ref.startsWith("person.card")) {
      const p = (o.person as Row | null) ?? null;
      if (!o.found || !p) return { kind: "person", id: "", title: "該当する方が見つかりませんでした", subtitle: "お名前・電話番号・会員番号で探せます", fields: [] };
      const fields: Row[] = [
        { k: "電話", v: p.phone }, { k: "カナ", v: p.kana }, { k: "生年月日", v: p.birth_date }, { k: "性別", v: p.gender },
        { k: "来店回数", v: p.visit_count }, { k: "初回", v: p.first_visit }, { k: "最終来店", v: p.last_visit },
        { k: "入会", v: p.join_date }, { k: "退会", v: p.leave_date }, { k: "注意", v: p.alert }, { k: "メモ", v: p.note },
      ];
      const srcs = Array.isArray(p.sources) ? (p.sources as string[]).join(" / ") : "";
      const cand = Number(o.candidates ?? 1) > 1 ? `（他 ${Number(o.candidates) - 1} 名の候補あり）` : "";
      return { kind: "person", id: String(p.phone ?? p.name ?? ""), title: String(p.name ?? ""), subtitle: `${srcs}${p.store ? " · " + p.store : ""}${cand}`, fields };
    }
    if (ref.startsWith("customer.card")) {
      const m = (o.member as Row | null) ?? null;
      if (!o.found || !m) return { kind: "person", id: "", title: "見つかりませんでした", subtitle: "", fields: [] };
      return { kind: "person", id: String(m.member_no ?? ""), title: String(m.member_name ?? ""), subtitle: `${o.store ?? ""} ${m.plan_name ?? m.member_type ?? ""}`, fields: Object.entries(m).map(([k, v]) => ({ k, v })) };
    }
    if (ref.startsWith("walkin.add")) return { kind: "person", id: String(o.walkin_id ?? ""), title: String(o.guest ?? ""), subtitle: `受付台帳 ${o.visited_on ?? ""}${o.already ? "（登録済み）" : ""}`, fields: [] };
    if (ref.startsWith("devreq.create")) return { kind: "devreq", id: String(o.request_id ?? ""), title: String(o.title ?? ""), subtitle: "開発依頼をキューに積みました", fields: [], href: "/dev-requests" };
    return { kind: "entity", id: String(o.id ?? ""), title: String(o.title ?? o.name ?? ref), subtitle: "", fields: [] };
  },
  BookingCard: (o) => ({ booking_id: o.booking_id ? String(o.booking_id) : null, date: String(o.date ?? ""), start: String(o.start ?? ""), end: String(o.end ?? ""), bay: String(o.bay ?? ""), who: String(o.who ?? ""), status: o.cancelled ? "cancelled" : "confirmed" }),
  SourceNote: (o, ref) => ({ title: ref.startsWith("sales.query") ? String(o.answer ?? "") : ref, body: ref.startsWith("sales.query") ? (o.error ? String(o.error) : "") : JSON.stringify(o).slice(0, 2000), sql: o.sql == null ? null : String(o.sql), rowCount: o.row_count == null ? null : Number(o.row_count) }),
  MessageDraft: (o) => ({ to: String(o.target ?? ""), channel: "line", body: String(o.body ?? ""), audience: String(o.audience ?? "staff") }),
};

export function blocksFromExecution(blocks: BlockRegistry, r: ExecutionResult): BlockInstance[] {
  const meta: BlockMeta = { kind: r.kind, sources: r.sources, asOf: r.sources[0]?.updatedAt ?? null, rowCount: r.rowCount };
  if (r.status === "needs_approval") {
    return [blocks.make("ApprovalCard", { action_id: r.executionId ?? "", title: r.tool, detail: r.policy?.reason ?? "", risk: 0, mode: r.policy?.decision ?? "approval" }, { ...meta, kind: "fact" })];
  }
  if (r.status !== "ok" && r.status !== "idempotent") {
    return [blocks.make("SourceNote", { title: `${r.tool}: ${r.status}`, body: r.error ?? "" }, { ...meta, kind: "fact" })];
  }
  const out = (r.output ?? {}) as Row;
  const name = r.renders ?? "Table";
  const adapter = ADAPTERS[name];
  const data = adapter ? adapter(out, r.tool) : out;
  const main = blocks.make(name, data, meta);
  const list: BlockInstance[] = [main];
  // 履歴を持つ出力（person.card）は Timeline も添える
  if (Array.isArray(out.timeline) && (out.timeline as Row[]).length) {
    list.push(blocks.make("Timeline", { entity: `person:${String((out.person as Row | null)?.name ?? "")}`, items: out.timeline as Row[] }, meta));
  }
  // Ask Data 以外の読み Tool にも出典を添える（数字の信頼性・GO条件15）
  if (name !== "SourceNote" && r.sources.length) {
    list.push(blocks.make("SourceNote", { title: `出典: ${r.sources.map((s) => s.table).join(", ")}`, body: `${r.tool} · ${r.kind}${r.rowCount != null ? ` · ${r.rowCount}件` : ""}${r.silentZero ? " · ⚠ 期待より少ない" : ""}`, rowCount: r.rowCount }, { ...meta, kind: "fact" }));
  }
  // 行が表になる Tool は Table も付けて中身を見せる（KPI / Summary は数字だけなので）
  if ((name === "KPI" || name === "Summary" || name === "BookingList" || name === "Health") && asRows(out).length) {
    list.splice(1, 0, blocks.make("Table", ADAPTERS.Table(out, r.tool), meta));
  }
  return list;
}
