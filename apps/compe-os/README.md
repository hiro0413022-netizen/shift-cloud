# Compe OS

ゴルフコンペの受付・組み合わせ・スコア・表彰までを1つで回すアプリ（DECISIONS #232）。

- 正典: `docs/modules/compe-os/SYSTEM.md`
- 計算: `@yozan/core/compe-score`（ペリア・順位。式はここ1か所）
- DB: `cmp_*`（`supabase/migrations/0156_compe_os.sql`）
- 権限: `use_compe` / `view_hq`

```bash
npm run dev -w apps/compe-os   # http://localhost:3014
```

環境変数（Vercel Root Directory = `apps/compe-os`）:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```
