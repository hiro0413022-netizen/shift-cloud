# DESIGN SYSTEM

参考: Apple / Linear / Notion / Stripe / Vercel / ChatGPT

## 原則

- シンプル・余白広め・高級感。装飾より整列と階層
- スタッフ画面: スマホ最適化、迷わない、1画面1目的
- iPad打刻: 極限まで簡単。大ボタン、2タップで完了
- 管理画面: 情報量が多くても整理（テーブル＋フィルタ＋詳細パネル）
- 本部画面: ダッシュボード重視（KPIカード＋比較チャート）

## トークン

| 項目 | 値 |
|------|-----|
| フォント | system-ui / -apple-system（日本語: Hiragino Sans, Noto Sans JP） |
| ベース色 | zinc（背景 white / zinc-50、テキスト zinc-900） |
| アクセント | `#0F6B4F`（YOZAN Green、CTA・選択状態） |
| 危険 | red-600 / 警告 amber-500 / 成功 emerald-600 |
| 角丸 | rounded-lg（カード）、rounded-md（入力・ボタン） |
| 影 | shadow-sm基本。ホバーでshadow-md |
| 余白 | セクション間 space-y-6、カード内 p-6 |

## 画面タイプ別レイアウト

- **スタッフ（モバイル）**: 下部タブナビ（ホーム/シフト/希望提出/お知らせ）、カード積み上げ
- **管理（PC）**: 左サイドバー＋ヘッダー（店舗切替）＋コンテンツ
- **iPad打刻**: 全画面キオスク。スタッフグリッド → アクション4大ボタン → 完了フィードバック3秒
- **本部**: 上部フィルタ（期間・ブランド・店舗）＋KPIグリッド＋テーブル

## ステータス色

シフト: draft=zinc / published=green。勤怠: 正常=green / 遅刻・早退=amber / 打刻漏れ=red。AI提案重要度: info=blue / warning=amber / critical=red

## モバイル対応（NEXT_TASKS MB / 2026-07-13）

全アプリ共通の基準。**新規画面はスマホ幅（375px）で崩れないことを実装時に確認する。**

- **ナビ**: サイドバーは `hidden md:flex`。md未満はハンバーガー＋左ドロワー（genesis `components/mobile-nav.tsx` が参照実装）またはスタッフ向けは下部タブ（shift-cloud `StaffNav`）
- **余白**: main は `p-4 md:p-6`
- **段組み**: 新規コードは必ずレスポンシブ指定（`grid-cols-1 md:grid-cols-3` 等）。既存PC前提ページの救済として genesis の globals.css に md未満で grid-cols-2→1列 / 3〜6→2列 に畳むオーバーライドあり（**新規コードはこれに頼らない**）
- **テーブル**: md未満は横スクロール（`table{display:block;overflow-x:auto}` 救済あり）。理想はカード表示への切替
- **タップ対象**: 最小 40×40px（`h-10` 目安）
- **viewport**: Next.jsのデフォルト（width=device-width）で足りる。上書き不要
- 展開順: shift-cloud（済・元からモバイルファースト）→ genesis（済）→ member-os → money/legal/report/survey/reserve/caddy
