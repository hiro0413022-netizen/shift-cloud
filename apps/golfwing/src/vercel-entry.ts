// Vercel (Node runtime) エントリ — esbuildでapi/handler.mjsへバンドルされる
import { app } from './index'
import { createPgD1 } from './lib/pgdb'

const REF = 'qrgpblnnhdudigarrtuz'
const POOLER = 'aws-0-ap-northeast-1.pooler.supabase.com:6543'

// 入力値の揺れ（[ ]付きパスワード・未エンコードの?!・directホスト・ユーザー名のref欠落）を
// すべて吸収してSupabaseプーラー向けの正しい接続文字列を再構築する
function normalizeDbUrl(raw: string): string {
  const s = (raw || '').trim().replace(/^['"]|['"]$/g, '')
  const m = s.match(/^postgres(?:ql)?:\/\/(.*)@([^@]+)$/)
  if (m && (m[2].includes('pooler.supabase.com') || m[2].startsWith('db.'))) {
    const cred = m[1]
    const ci = cred.indexOf(':')
    let user = ci < 0 ? cred : cred.slice(0, ci)
    let pass = ci < 0 ? '' : cred.slice(ci + 1)
    pass = pass.replace(/^\[|\]$/g, '')            // テンプレの[ ]除去
    try { pass = decodeURIComponent(pass) } catch { /* 未エンコードのまま */ }
    if (!user.includes('.')) user = 'postgres.' + REF
    const dbPart = m[2].split('/')[1] || 'postgres'
    return 'postgresql://' + user + ':' + encodeURIComponent(pass) + '@' + POOLER + '/' + dbPart.split('?')[0]
  }
  return s
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
