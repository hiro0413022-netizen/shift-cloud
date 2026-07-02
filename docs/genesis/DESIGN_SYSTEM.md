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
