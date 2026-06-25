# BUSINESS.md — 業務フロー詳細

> **最終更新**: 2026-06-25

---

## 1. 業務概要

ゴルフウィングは、顧客（ゴルファー）からシャフト・グリップ等のカスタムオーダーを受け、  
仕入先メーカー（フジクラ、グラファイトデザイン、イオミック等）から在庫を仕入れて販売するゴルフショップ。

**主要業務フロー**: 顧客受注 → 仕入先への発注 → 入荷・検品 → 顧客への納品

---

## 2. メイン業務フロー（Mermaid）

```mermaid
flowchart TD
    A[👤 顧客からオーダー受付] --> B{商品在庫確認}
    B -->|在庫あり| C[在庫から納品]
    B -->|在庫なし| D[発注作成]
    
    D --> E{発注方法}
    E -->|通常発注| F[新規発注フォーム入力]
    E -->|複数顧客まとめ| G[発注プール登録]
    
    F --> H[発注下書き作成\nbatch_code自動付与]
    G --> I[プール一括実行\n仕入先ごとに集約]
    I --> H
    
    H --> J[メール一括送信画面\nmail-batch/batch_code]
    J --> K[仕入先へメール送信\nCC設定・候補ボタン]
    K --> L[ステータス: ordered]
    
    L --> M{入荷確認}
    M -->|期限超過| N[⚠️ ダッシュボードにアラート]
    N --> O[仕入先へ納期確認]
    O --> M
    
    M -->|入荷| P[入荷登録\nreceipts/new/order_id]
    P --> Q{全品入荷?}
    Q -->|一部| R[ステータス: partial\n残注に表示]
    Q -->|全部| S[ステータス: completed\n検品済み]
    
    R --> M
    S --> T[Excelダウンロード\n入荷明細.xlsx]
    T --> U[👤 顧客へ納品・連絡]

    style A fill:#e8f5e9
    style N fill:#fff3e0
    style K fill:#e3f2fd
    style U fill:#e8f5e9
```

---

## 3. 発注作成フロー詳細

```mermaid
sequenceDiagram
    participant Staff as ショップスタッフ
    participant UI as 発注フォーム<br/>/orders/new
    participant API as バックエンドAPI
    participant DB as Cloudflare D1
    participant Mail as メールクライアント

    Staff->>UI: 顧客名・商品を入力
    UI->>API: GET /api/products-for-order?q=商品名
    API->>DB: SELECT products WHERE name LIKE
    DB-->>API: 商品候補リスト
    API-->>UI: JSON (商品一覧)
    
    UI->>API: GET /api/products/:id/suppliers
    API->>DB: SELECT product_suppliers + supplier_rules
    DB-->>API: 仕入先候補（掛け率付き）
    API-->>UI: JSON (仕入先候補)
    
    Note over UI: 掛け率×定価=仕入単価 自動計算
    
    Staff->>UI: 確認・送信（下書き保存 or 発注）
    UI->>API: POST /api/orders
    API->>DB: INSERT purchase_orders + purchase_order_items
    DB-->>API: order_id, batch_code
    API-->>UI: {ok: true, orderId, batchCode}
    
    UI->>UI: /mail-batch/:batch_code に自動遷移
    
    Staff->>UI: メール内容確認・CC設定
    UI->>API: POST /api/orders/:id/status {status: ordered}
    API->>DB: UPDATE purchase_orders SET status='ordered'
    API-->>UI: {ok: true, next_mail_batch?, next_order_id?}
    
    Note over UI: 同一顧客の次の発注があれば確認ダイアログ
    
    UI->>Mail: mailto:リンクをクリック
    Mail-->>Staff: メールソフト起動（下書き展開）
    Staff->>Mail: 送信
```

---

## 4. 発注プールフロー

複数の顧客分をまとめて1通のメールで発注する際に使用。

```mermaid
flowchart LR
    A[顧客A: シャフトX] -->|プール登録| Pool[(発注プール\nstatus=pool)]
    B[顧客B: シャフトX] -->|プール登録| Pool
    C[顧客C: シャフトY] -->|プール登録| Pool
    
    Pool -->|仕入先A: ワークス| D[一括発注\nbatch_code=WK-20260625]
    Pool -->|仕入先B: フジクラ| E[一括発注\nbatch_code=FJ-20260625]
    
    D --> F[メール送信→発注済]
    E --> G[メール送信→発注済]
```

---

## 5. 入荷・検品フロー

```mermaid
stateDiagram-v2
    [*] --> draft: 発注作成（下書き）
    draft --> draft_created: 下書き保存
    draft_created --> ordered: メール送信完了
    draft --> pool: プール登録
    pool --> ordered: プール一括実行→メール送信
    ordered --> partial: 一部入荷登録
    ordered --> completed: 全品入荷登録
    partial --> partial: 追加入荷（まだ残あり）
    partial --> completed: 全品入荷完了
    ordered --> cancelled: キャンセル
    partial --> cancelled: キャンセル
    completed --> [*]
    cancelled --> [*]
```

---

## 6. 仕入先判定ロジック

```mermaid
flowchart TD
    A[商品選択] --> B{product_suppliersに\n登録あり?}
    B -->|はい| C[登録済み仕入先リスト表示\n掛け率付きセレクト]
    B -->|いいえ| D{products.default_supplier_id\nあり?}
    D -->|はい| E[デフォルト仕入先を使用]
    D -->|いいえ| F[supplier_rules検索\n品目×メーカー×クラブタイプでマッチング]
    F --> G{ルール\nマッチ?}
    G -->|はい| H[ルールの仕入先・掛け率を適用]
    G -->|いいえ| I[手動入力]
    
    C --> J[発注明細に反映]
    E --> J
    H --> J
    I --> J
```

---

## 7. データの流れ

```mermaid
flowchart LR
    subgraph Input["入力データ"]
        P[products\n商品マスタ]
        S[suppliers\n仕入先マスタ]
        SR[supplier_rules\n判定ルール]
        PS[product_suppliers\n商品×仕入先]
    end
    
    subgraph Order["発注管理"]
        PO[purchase_orders\n発注ヘッダー]
        POI[purchase_order_items\n発注明細]
    end
    
    subgraph Receipt["入荷管理"]
        R[receipts\n入荷ヘッダー]
        RI[receipt_items\n入荷明細]
    end
    
    subgraph Auth["認証"]
        T[tenants\nテナント]
        U[users\nユーザー]
    end
    
    P --> POI
    S --> PO
    SR --> PO
    PS --> PO
    PO --> POI
    PO --> R
    POI --> RI
    T --> U
    T --> PO
    T --> P
    T --> S
```

---

## 8. 承認フロー

現在、**承認フローは実装されていない**。  
ショップスタッフが直接発注メールを送信できる権限を持つ。

```
現状: スタッフ → 発注作成 → メール送信（承認なし）

理想: スタッフ → 発注作成 → 店長承認 → メール送信
```

**課題**: 金額の大きい発注（例：ヘッドを複数本）でも承認なしに発注できてしまう。

---

## 9. 困っていること・課題

| 課題 | 影響 | 優先度 |
|---|---|---|
| メール送信がmailto:リンク経由（クライアントMUA依存） | デバイス・メールソフトによっては動作しない | 高 |
| 承認フローなし | 誤発注リスク | 高 |
| 在庫管理なし | 在庫状況をシステムで把握できない | 中 |
| LINE・FAX発注の手動作業 | 発注方法がメール以外の仕入先は手動で転記 | 中 |
| ユーザー管理UIなし | ユーザー追加・変更にSQL直接操作が必要 | 中 |
| パスワードが平文保存（DB内） | セキュリティリスク | 高 |
| メーカー表記揺れ対応が煩雑 | supplier_rulesに大量の同義語ルールが必要 | 低 |

---

## 10. 改善できること

| 改善案 | 効果 | 難易度 |
|---|---|---|
| メール送信の内部化（SendGrid/Resend） | デバイス依存解消・送信ログ管理 | 中 |
| 承認フロー実装 | 誤発注防止 | 中 |
| パスワードのbcryptハッシュ化 | セキュリティ向上 | 低 |
| メーカー表記揺れの正規化（fuzzy match） | ルール登録作業削減 | 中 |
| 在庫数管理機能追加 | 在庫切れ防止 | 高 |
| Slack通知連携 | 入荷・発注アラートのリアルタイム通知 | 低 |
| ユーザー管理UI | 運用負荷削減 | 低 |
