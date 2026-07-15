# スタッフへ連絡（公式LINE配信）— 正典

古川さんが個別にLINEするのをやめ、**Genesisで1回書けば公式LINEのスタッフグループへ届き、記録も残る**仕組み。
決定: DECISIONS #59 / migration `0059_staff_line_broadcast.sql`

## 流れ

```
Genesis /notice で連絡を書く
   ├─ gn_directives に記録（origin_kind='notice'。あとで /notice の履歴で追える）
   ├─（任意）sp_tasks 店舗共通タスク（スタッフアプリの「やること」に出る／DECISIONS #55）
   └─ gn_line_outbox に積む（status=pending）
          └─ n8n「スタッフ連絡LINE配信」が5分おきに拾って
             YOZAN公式LINEのグループへ Push → status=sent/error を書き戻す
```

## なぜこの形か

- 数字も判断も絡まない単純な配信なので **LLMは使わない**。
- 送信は reserve-os と同じ「DBキュー → n8nがPush → 書き戻し」方式（二重送信は `sent_at` で防ぐ）。
- **公式アカウントはYOZAN**（GOLF WINGの顧客用とは別チャネル）。スタッフ連絡＝YOZAN、顧客対応＝GOLF WING で分離。

## LINE配線（n8n / yozan.app.n8n.cloud）

| ワークフロー | 役割 |
|---|---|
| YOZAN公式LINE 受信（グループID取得） | Webhook `/webhook/line-yozan`。グループ発話から groupId を拾い `gn_line_groups` に登録 |
| スタッフ連絡LINE配信 | 5分おきに `gn_line_outbox`(pending) を Push。トークンは app_config `YOZAN_LINE_CHANNEL_ACCESS_TOKEN` |

- app_config（n8n Data table）に `YOZAN_LINE_CHANNEL_SECRET` / `YOZAN_LINE_CHANNEL_ACCESS_TOKEN` の2行が必要。
- 送信成功の判定は LINE応答の `sentMessages` の有無（成功時に statusCode が返らないため）。

## DB

| テーブル | 中身 |
|---|---|
| `gn_line_groups` | 配信先グループ（line_group_id・store_id・is_default）。既定＝スタッフ連絡（YOZAN公式）→ GOLF WING 宝塚 |
| `gn_line_outbox` | 配信キュー（to_group_id・body・directive_id・status・sent_at・error） |

## ファイル

| 役割 | 場所 |
|---|---|
| ロジック | `apps/genesis/src/lib/staff-notice.ts`（`sendStaffNotice` / `getNotices` / `getLineGroups`） |
| 画面 | `apps/genesis/src/app/(main)/notice/`（page / actions / notice-client） |
| DB | `supabase/migrations/0059_staff_line_broadcast.sql` |

## 既知の限界 / 次

- 送信先は既定グループ1つ想定（複数店グループになったら gn_line_groups.store_id で振り分け）。
- 「やること」は店舗共通タスク（宝塚）。YOZANグループが複数店にまたがる場合は要見直し。
- LINE公式アカウントのPush無料枠は月200通。
