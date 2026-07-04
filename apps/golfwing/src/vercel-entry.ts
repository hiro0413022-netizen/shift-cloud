// Vercel (Node runtime) エントリ — esbuildでapi/handler.mjsへバンドルされる
import { app } from './index'
import { createPgD1 } from './lib/pgdb'

let db: ReturnType<typeof createPgD1> | null = null

export default async function handler(req: Request): Promise<Response> {
  if (!db) db = createPgD1(process.env.GW_DATABASE_URL || '')
  const env = { ...process.env, DB: db as unknown }
  return app.fetch(req, env)
}
