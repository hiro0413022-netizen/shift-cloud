// Vercel (Node runtime) エントリポイント — Cloudflare Workers版と同じHonoアプリを起動
import { app } from '../src/index'
import { createPgD1 } from '../src/lib/pgdb'

const db = createPgD1(process.env.GW_DATABASE_URL || '')

const env = {
  ...process.env,
  DB: db as unknown,
}

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req, env)
}
