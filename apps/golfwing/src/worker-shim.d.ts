// Cloudflare Workers型の互換シム（Vercel/Node移行後もD1Database型名を残すため）
declare interface D1PreparedStatementLike {
  bind(...args: unknown[]): D1PreparedStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean; meta: { last_row_id: number | null; changes: number; duration: number } }>
  first<T = Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ results: unknown[]; success: boolean; meta: { last_row_id: number | null; changes: number; duration: number } }>
  raw<T = unknown[]>(): Promise<T[]>
}
declare interface D1Database {
  prepare(sql: string): D1PreparedStatementLike
  batch(stmts: D1PreparedStatementLike[]): Promise<unknown[]>
  exec(sql: string): Promise<unknown>
}
declare type ScheduledEvent = unknown
declare interface ExecutionContext { waitUntil(p: Promise<unknown>): void }
declare type D1PreparedStatement = D1PreparedStatementLike
