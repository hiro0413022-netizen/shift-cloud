# 株式会社YOZAN コーポレートサイト

## 概要
ゴルフ業界の成長を、仕組みで支える会社YOZANのコーポレートサイト。

## 技術スタック
- **フレームワーク**: Next.js 16 (App Router)
- **スタイリング**: Tailwind CSS v4
- **データベース**: Supabase
- **デプロイ**: Vercel
- **言語**: TypeScript

## 5つの事業
1. **01 人材事業** - キャディー派遣・レッスンプロ派遣・人材育成
2. **02 DX事業** - PGA NOTE・Golf OS・発注/在庫管理システム
3. **03 マーケティング事業** - SNS運用・Web広告・コンテンツ制作
4. **04 運営支援** - コンサルティング・業務改善・研修
5. **05 アパレル事業** - [kallinos.jp](https://kallinos.jp)

## セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定

# 開発サーバー起動
npm run dev
```

## 環境変数
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## ページ構成
- `/` - トップページ
- `/business` - 事業紹介
- `/marketing` - マーケティング事業
- `/about` - 会社概要
- `/vision` - ビジョン
- `/recruit` - 採用情報
- `/contact` - お問い合わせ

## 会社情報
- **ウェブサイト**: https://yozan-inc.jp
- **メール**: info@yozan-inc.jp
