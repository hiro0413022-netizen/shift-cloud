# @yozan/track（配布リンクの閲覧計測）— 正典

「送ったものを相手が見たか」をアプリ横断で測る共通モジュール。
`packages/track`（migration 0085・DECISIONS #95・テーブル `trk_*`）。

## 1. なぜ作ったか

営業の律速は「誰に電話するか」。全件に架電すると効率が落ちるが、
**デモを開いた先だけに架電すれば繋がる率が跳ね上がる**。
この「開いたか」を取るのは demo-sales 固有の要求に見えて、実際には

- reserve-os の予約リンク
- survey-os のアンケート
- report-os の月次資料
- SWING CORTEX の診断結果

でも同じ形（**トークン付きURLで配った成果物**）をしている。だから最初から共通パッケージにした。

## 2. データ（trk_* / 0085）

| テーブル | 役割 |
|---|---|
| `trk_links` | 配ったURL1本＝1行。`app` / `resource_type` / `resource_id` / `token` で任意のシステムから使える。閲覧数・合計滞在秒・初回開封・通知済みを保持 |
| `trk_sessions` | 閲覧1回＝1行。滞在秒・見たページ・端末（mobile/desktop）。`session_key` はクライアント生成の乱数 |
| `trk_events` | open / page / click の粒度ログ。heartbeat は保存せずセッションの秒数に畳む |

- RLS有効・ポリシーなし＝**service_role専用**（本リポジトリの標準形 #65）
- **個人情報は保存しない**。IPは保存せず、UAは300字で切って端末判定にのみ使う
- 記録は RPC **`trk_record`** 1本に集約（トークン照合→セッション更新→イベント→集計→初回開封の company_events 記録を原子的に）

### 社内プレビューの除外

営業担当が自分でデモを開いた分を数えると「開封＝ホットリード」が嘘になる。
管理画面からのリンクには **`?preview=1`** を付け、`trk_sessions.is_internal=true` として
`view_count` / `total_seconds` / `first_viewed_at` の**すべてから除外**する。

## 3. 使い方（3ステップ）

```ts
// 1) 配信時にリンクを登録（冪等・既存トークンをそのまま渡す）
import { registerLink } from "@yozan/track/server";
await registerLink(admin, {
  companyId, app: "demo-sales", resourceType: "demo", resourceId: demo.id,
  token, label: prospect.name, href: `/p/${prospect.id}`,
});

// 2) 配信するHTMLにビーコンを差し込む（保存済みHTMLは書き換えない）
import { injectTracking } from "@yozan/track/beacon";
const html = injectTracking(demo.html, { endpoint: "/api/track", token, internal });

// 3) 受信ルートを1本生やす
// src/app/api/track/route.ts
export const POST = createTrackHandler(() => createAdmin());
```

⚠ **middleware の `publicPrefixes` に `/api/track` を追加すること**。
公開APIの登録漏れは実際に本番を落としている（#90）。
利用側の `next.config.ts` に `transpilePackages: ["@yozan/track"]` も必要。

### 差し込みは「配信時」であって「生成時」ではない

保存済みHTMLを書き換えないので、**既存の成果物も再生成なしで計測対象になる**。
デモの版管理（`dms_demos.version`）にも影響しない。

## 4. 読み出しAPI

| 関数 | 用途 |
|---|---|
| `getLinkByResource(admin, app, type, id)` | 管理画面で「この資料の閲覧状況」を出す |
| `listSessions(admin, linkId)` | 閲覧履歴（日時・端末・滞在・見たページ）。社内プレビューは既定で除外 |
| `getHotLinks(admin, companyId, {app, withinHours, onlyUnnotified})` | 開封済みリンク＝ホットリード |
| `markNotified(admin, linkIds)` | 対応済みにする（フィードから消える） |
| `formatDuration(seconds)` | 「3分20秒」表示の共通化 |

## 5. 現在の接続先

| アプリ | 対象 | 画面 |
|---|---|---|
| demo-sales | 営業デモ `/d/[token]` | `/p/[id]` に閲覧状況パネル（初回/最終・回数・滞在・見たページ） |
| genesis | 全アプリ横断 | ホームの判断フィードに **「デモ開封」カード**（`hotlead`）。開封直後ほど上に出る＝新しい順 |

ホットリードは `notified_at` が null の間だけフィードに出る。
「対応した」を押すと `notified_at` が入り、`company_events` に記録される。
初回開封そのものも `company_events(event_type='track.first_view')` に入るので、
ホームのティッカー・CEO AIの観測・朝のダイジェストへ自動で合流する。

## 6. 未実装・後続

- **メール通知**（ユーザー選択済み）— `@yozan/outreach`（②）着手時に接続する。現状はGenesisホームのみ
- 3日開かない先への自動リマインド（outreach 前提）
- reserve-os / survey-os / report-os への横展開（登録2行＋ルート1本で足りる）
- クリック計測（`kind='click'` は受け口だけ用意済み・呼び出し側は未実装）
