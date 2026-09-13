# craft-os — フィッティング・工房管理

GOLF WING のフィッティング表紙・見積書・注文書・工房の組立指示書を1本につないだアプリ。
2冊のExcel（`01_試打シャフト表紙.xlsm` / `00_雛形.xlsm`）を置き換える。

## 考え方

- **定価は持たない。** 正典は `golfwing.products`（発注管理が保守している商品マスタ 3,138件）。
  値上げは発注管理で1回直せば、表紙・見積・注文書すべてに反映される。
- **試打NO（1〜1490）は変えない。** ラックのバーコードと紙の運用がこの番号で回っている。
- **割引とフィッティング料返金の式は `@yozan/core/fitting-quote` の1か所だけ。**
  画面ごとに書くと、表紙・見積書・注文書で金額が割れる。
- **工房は「目標（範囲）」と「実測」を別に持つ。** 次回来店時に「前回の仕上がり」を数字で出すため。

## テーブル（golfwing スキーマ）

| | |
|---|---|
| `demo_shafts` | 試打シャフト台帳（試打NO ↔ 商品マスタ、棚番号） |
| `labor_rates` | 工賃マスタ |
| `discount_rules` | 割引ルール（掛け率で持つ。0.80 = 20%OFF） |
| `quotes` / `quote_items` | 見積 |
| `work_orders` / `work_order_specs` | 注文書と組立指示書 |

migration: `supabase/migrations/0160_craft_os.sql` 〜 `0163_craft_os_rules_2026_09_12.sql`

## 権限

`use_craft`（または `view_hq`）。2026-09-12 に 会社オーナー／本部／エリアマネージャー／店舗責任者／コーチング（店舗）／受付 へ付与済み。

## 開発

```
npm run dev -w apps/craft-os   # http://localhost:3015
npm test                       # tests/fitting-quote.test.ts ほか
```
