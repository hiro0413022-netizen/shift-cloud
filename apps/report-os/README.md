# report-os — 事業所別 月次資料 生成器

事業所ごとの月次報告 `.pptx` を JSON から生成する。設計の正典は `docs/modules/report-os/SYSTEM.md`。

## 構成

```
apps/report-os/
├── generate.js        # JSON → .pptx （本体・稼働中）
├── build-data.mjs     # Supabase + Claude API → data JSON （自動化の雛形）
├── data/
│   └── golfwing-2026-06.json   # データ形式のサンプル
└── GOLFWING_月次報告_2026-06_サンプル.pptx  # 生成物サンプル
```

## 使い方

```bash
# 1) 依存
npm i pptxgenjs

# 2) JSONから資料を生成（すぐ試せる）
node generate.js data/golfwing-2026-06.json

# 3) 自動でJSONを組み立て（DB接続後）
SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... ANTHROPIC_API_KEY=... \
  node build-data.mjs <company_id> 2026-06 現場メモ.txt
node generate.js data/golfwing-2026-06.json
```

## いま自動 / これから自動

- ✅ 自動: 会員数・退会率・入会率・体験予約・スタッフ（kpis）
- ❌ 要整備: 物販売上・フィッティング件数の記録、会員数の月次履歴（SYSTEM.md §4）
- 🤖 AI下書き: 実施事項・問題点・解決策・情報共有（Claude API、人が承認）
