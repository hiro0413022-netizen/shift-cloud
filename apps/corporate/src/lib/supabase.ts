import { createClient } from '@supabase/supabase-js'

// Supabase接続クライアント
// 環境変数は .env.local（ローカル）または Vercel の Environment Variables に設定
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

// ブラウザ・サーバーサイド共用クライアント
export const supabase = createClient(supabaseUrl, supabaseAnon)

// 型定義（将来 supabase gen types で自動生成した型を差し込む場所）
export type Database = {
  // 例: contacts テーブル
  // public: {
  //   Tables: {
  //     contacts: {
  //       Row: { id: number; name: string; email: string; message: string; created_at: string }
  //       Insert: { name: string; email: string; message: string }
  //       Update: Partial<{ name: string; email: string; message: string }>
  //     }
  //   }
  // }
}
