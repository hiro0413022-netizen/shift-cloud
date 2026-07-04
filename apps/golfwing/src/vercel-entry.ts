// Vercel (Node runtime) エントリ — esbuildでapi/handler.mjsへバンドルされる
// Vercelは名前付きHTTPメソッドエクスポート(GET/POST/...)でWeb標準Request/Responseを使う
import { app } from './index'
import { createPgD1 } from './lib/pgdb'

let db: ReturnType<typeof createPgD1> | null = null

const handler = async (req: Request): Promise<Response> => {
  if (!db) db = createPgD1(process.env.GW_DATABASE_URL || '')
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
