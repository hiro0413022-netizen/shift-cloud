// D1互換Postgresアダプタ（P3: D1→Supabase移行）
// c.env.DB.prepare(sql).bind(...).all()/.first()/.run() と db.batch() をそのまま再現する。
// SQLite方言はここで一括変換（route側のコードは無修正）。
import postgres from 'postgres'

type Row = Record<string, unknown>

export interface D1Result<T = Row> {
  results: T[]
  success: boolean
  meta: { last_row_id: number | null; changes: number; duration: number }
}

// ── SQLite → Postgres 方言変換 ──────────────────────────
const BOOL_COLS = 'is_active|is_default|is_admin|is_demo|slip_verified|no_slip'

export function translateSql(sql: string): string {
  let s = sql
  // boolean比較: is_active = 1 → is_active = true
  s = s.replace(new RegExp(`\\b(${BOOL_COLS})\\s*=\\s*1\\b`, 'g'), '$1 = true')
  s = s.replace(new RegExp(`\\b(${BOOL_COLS})\\s*=\\s*0\\b`, 'g'), '$1 = false')
  // julianday
  s = s.replace(/julianday\('now'\)/gi, "(extract(epoch from now())/86400.0 + 2440587.5)")
  s = s.replace(/julianday\(([a-zA-Z0-9_.]+)\)/gi, "(extract(epoch from ($1)::timestamptz)/86400.0 + 2440587.5)")
  // GROUP_CONCAT(x, sep) / GROUP_CONCAT(x)
  s = s.replace(/GROUP_CONCAT\(\s*([^,()]+)\s*,\s*('[^']*')\s*\)/gi, 'string_agg(($1)::text, $2)')
  s = s.replace(/GROUP_CONCAT\(\s*([^,()]+)\s*\)/gi, "string_agg(($1)::text, ',')")
  // INSERT OR REPLACE → INSERT ... ON CONFLICT(id) は呼び出し側で不可のため主キー衝突は無視
  s = s.replace(/INSERT OR REPLACE INTO/gi, 'INSERT INTO')
  s = s.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
  return s
}

// ? プレースホルダ → $1..$n（文字列リテラル内の?は無視）
export function numberPlaceholders(sql: string): string {
  let out = '', n = 0, inStr: string | null = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (inStr) {
      out += ch
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"') { inStr = ch; out += ch; continue }
    if (ch === '?') { n++; out += '$' + n; continue }
    out += ch
  }
  return out
}

function isInsert(sql: string): boolean {
  return /^\s*insert\b/i.test(sql) && !/returning/i.test(sql)
}

class PgStatement {
  constructor(
    private client: ReturnType<typeof postgres>,
    public sqlText: string,
    public params: unknown[] = []
  ) {}

  bind(...args: unknown[]): PgStatement {
    return new PgStatement(this.client, this.sqlText, args)
  }

  private prepared(): { text: string; params: unknown[] } {
    let text = numberPlaceholders(translateSql(this.sqlText))
    if (isInsert(text)) text += ' RETURNING id'
    return { text, params: this.params }
  }

  async all<T = Row>(): Promise<D1Result<T>> {
    const { text, params } = this.prepared()
    const rows = await this.client.unsafe(text, params as never[])
    return {
      results: rows as unknown as T[],
      success: true,
      meta: { last_row_id: (rows[0] as Row | undefined)?.id as number ?? null, changes: rows.count ?? rows.length, duration: 0 },
    }
  }

  async first<T = Row>(): Promise<T | null> {
    const r = await this.all<T>()
    return r.results[0] ?? null
  }

  async run(): Promise<D1Result> {
    return this.all()
  }
  async raw<T = unknown[]>(): Promise<T[]> {
    const r = await this.all<Row>()
    return r.results.map(row => Object.values(row)) as T[]
  }
}

export function createPgD1(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connection: { search_path: 'golfwing,public' },
  })
  return {
    prepare(sql: string): PgStatement {
      return new PgStatement(client, sql)
    },
    async batch(stmts: PgStatement[]): Promise<D1Result[]> {
      const out: D1Result[] = []
      for (const st of stmts) out.push(await st.run())
      return out
    },
    async exec(sql: string): Promise<{ count: number; duration: number }> {
      await client.unsafe(translateSql(sql))
      return { count: 1, duration: 0 }
    },
  }
}

export type PgD1 = ReturnType<typeof createPgD1>
