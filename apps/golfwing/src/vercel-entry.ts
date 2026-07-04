// Vercel (Node runtime) エントリ — esbuildでapi/handler.mjsへバンドルされる
import { app } from './index'
import { createPgD1 } from './lib/pgdb'

const PROJECT_REF = 'qrgpblnnhdudigarrtuz'

// Supabaseプーラー接続はユーザー名に「postgres.<project_ref>」が必須。
// 環境変数の入力ミス（Direct用のpostgresユーザー等）を自動補正する。
function normalizeDbUrl(raw: string): string {
  try {
    const u = new URL(raw)
    if (u.hostname.endsWith('.pooler.supabase.com') && !u.username.includes('.')) {
      u.username = `postgres.${PROJECT_REF}`
    }
    if (u.hostname === `db.${PROJECT_REF}.supabase.co`) {
      // Direct接続はVercelから不可(IPv6)のためプーラーへ差し替え
      u.hostname = 'aws-0-ap-northeast-1.pooler.supabase.com'
      u.port = '6543'
      u.username = `postgres.${PROJECT_REF}`
    }
    return u.toString()
  } catch {
    return raw
  }
}

let db: ReturnType<typeof createPgD1> | null = null

const handler = async (req: Request): Promise<Response> => {
  if (!db) db = createPgD1(normalizeDbUrl(process.env.GW_DATABASE_URL || ''))
  const env = { ...process.env, DB: db as unknown }
  return app.fetch(req, env)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
export const HEAD = handler
