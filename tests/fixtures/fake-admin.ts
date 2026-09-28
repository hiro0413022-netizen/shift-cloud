// Supabase service_role クライアントの最小フェイク（Genesis Core のテスト用）。
// from().select/insert/update と eq/neq/in/is/gte/lte/lt/order/limit/maybeSingle/single、
// select の { count:'exact', head:true } に対応。gn_tool_executions の idempotency 一意索引を模す。
type Row = Record<string, unknown>;

export function createFakeAdmin(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }));
  let seq = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

  function builder(table: string) {
    const rows = () => (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" = "select";
    let payload: Row | Row[] | null = null;
    let countMode = false;
    let head = false;
    let orderKey: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;
    let single: "single" | "maybe" | null = null;
    let inserted: Row[] = [];

    const api: Record<string, unknown> = {};
    const chain = (fn: () => void) => {
      fn();
      return api;
    };
    api.select = (_cols?: string, opts?: { count?: string; head?: boolean }) =>
      chain(() => {
        if (mode === "select") {
          countMode = !!opts?.count;
          head = !!opts?.head;
        }
      });
    api.insert = (p: Row | Row[]) =>
      chain(() => {
        mode = "insert";
        payload = p;
      });
    api.update = (p: Row) =>
      chain(() => {
        mode = "update";
        payload = p;
      });
    api.eq = (k: string, v: unknown) => chain(() => filters.push((r) => r[k] === v));
    api.neq = (k: string, v: unknown) => chain(() => filters.push((r) => r[k] !== v));
    api.in = (k: string, vs: unknown[]) => chain(() => filters.push((r) => vs.includes(r[k])));
    api.is = (k: string, v: unknown) => chain(() => filters.push((r) => (v === null ? r[k] == null : r[k] === v)));
    api.gte = (k: string, v: unknown) => chain(() => filters.push((r) => String(r[k]) >= String(v)));
    api.lte = (k: string, v: unknown) => chain(() => filters.push((r) => String(r[k]) <= String(v)));
    api.lt = (k: string, v: unknown) => chain(() => filters.push((r) => String(r[k]) < String(v)));
    api.gt = (k: string, v: unknown) => chain(() => filters.push((r) => String(r[k]) > String(v)));
    api.ilike = (k: string, v: string) => chain(() => filters.push((r) => String(r[k] ?? "").toLowerCase().includes(v.replace(/%/g, "").toLowerCase())));
    api.order = (k: string, o?: { ascending?: boolean }) =>
      chain(() => {
        orderKey = k;
        orderAsc = o?.ascending !== false;
      });
    api.limit = (n: number) => chain(() => (limitN = n));
    api.maybeSingle = () => chain(() => (single = "maybe"));
    api.single = () => chain(() => (single = "single"));

    const run = () => {
      if (mode === "insert") {
        const list = Array.isArray(payload) ? payload : [payload!];
        for (const p of list) {
          const row = { id: nextId(), created_at: new Date().toISOString(), ...p };
          if (table === "gn_tool_executions" && row.idempotency_key) {
            const dup = rows().find((r) => r.company_id === row.company_id && r.tool_name === row.tool_name && r.idempotency_key === row.idempotency_key && ["ok", "running"].includes(String(r.status)));
            if (dup) return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          rows().push(row);
          inserted.push(row);
        }
        const data = single ? inserted[0] : inserted;
        return { data, error: null };
      }
      let matched = rows().filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        for (const r of matched) Object.assign(r, payload as Row);
        const data = single === "maybe" ? matched[0] ?? null : single === "single" ? matched[0] : matched;
        return { data, error: null };
      }
      if (orderKey) matched = [...matched].sort((a, b) => (String(a[orderKey!]) < String(b[orderKey!]) ? -1 : 1) * (orderAsc ? 1 : -1));
      if (limitN != null) matched = matched.slice(0, limitN);
      if (countMode) return { data: head ? null : matched, count: matched.length, error: null };
      if (single === "maybe") return { data: matched[0] ?? null, error: null };
      if (single === "single") return matched[0] ? { data: matched[0], error: null } : { data: null, error: { message: "no rows" } };
      return { data: matched, error: null };
    };
    (api as { then: unknown }).then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej);
    return api;
  }

  return {
    tables,
    from: (table: string) => builder(table),
    rpc: async (_name: string, _args: unknown) => ({ data: [], error: null }),
  };
}
