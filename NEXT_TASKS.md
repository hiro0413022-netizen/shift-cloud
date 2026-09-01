# NEXT_TASKS

> **2026-07-14 実データ照合済み**（Vercel Deployments / Supabase / リポジトリを1件ずつ確認）。
> 「未デプロイ」等の古い記載を全面的に更新。完了分は §完了ログ に移動。

---

## A. ユーザー作業（これがブロッカー）

A-193. **Member OS のタブ並べ替え・予約1画面・タップ予約（#193）と Lesson OS のスマホUI（#194）を動かす**
   1. **`.\deploy-frank-tap-booking-193.ps1` を実行**（commit & push・migrationはありません）
   2. Vercel の member-os / lesson-os が **READY** になるまで待つ（#180: pushしただけでは本番に届きません）
   3. 動作確認（タブ）: member-os を開く → 上が **受付台帳／予約／FRANK会員／電子伝票／チェックイン**＋**その他 ▾** になっている →
      「その他」を押すと 体験申込・体験フォロー・来店検索 が出る
   4. 動作確認（統合）: 【予約】タブ → 月/週/日が切り替わる → 予約の名前を押すと詳細が開く → 未収金・当日一覧が同じ画面にある。
      古いブックマーク `/dashboard` を開くと予約画面に飛ぶ
   5. 動作確認（体験のタップ予約）: 日表示で**空いているマスを押す** → パネルが開く →【体験（初めての方）】→
      姓名・生年月日・電話・同意チェック → 【＋ 体験を確定する】 → **カレンダーに体験の予約が出る**／**受付台帳にもその方の行ができる**
   6. 動作確認（会員のタップ予約）: 空きマスを押す →【会員・都度利用】→ 会員名で検索して選ぶ → 利用時間 → 【＋ 予約を登録】
   7. 動作確認（Lesson OS・スマホ）: **iPhoneで** lesson-os を開く → タブが2段目に出て横に流せる → 生徒カードが**2列**で並ぶ →
      カルテを開いてタブが横1行 → 入力欄をタップしても**画面が拡大しない**
   8. 次の判断: 体験の入力パネルは「打席は自動割当」です。**特定の打席で取りたい**場合は、いったん登録してから
      予約の【日時・打席を変更】で移してください。打席を選べるようにするかはご要望次第です

A-191. **Money OS の経費入力（#191）を動かす**
   1. ~~Supabase で migration `0138_expense_staff_input.sql` を流す~~ **✅ 適用済み（2026-09-01・MCP）**
   2. **`.\deploy-money-expense-191.ps1` を実行**（commit & push）
   3. 動作確認: Money OS（https://money-golfwing.vercel.app）→ 上部メニューの **「経費入力」** →
      「店の現金」で1件入れる → **現金出納にも出金が1行増えて残高が減る** → 経費入力の一覧から削除 →
      **出納の行も消えて残高が戻る**
   4. 動作確認（掛け）: 「掛け（後日振込）」で1件入れる → 上部に「あとで支払い・精算するもの」が出る →
      振込が済んだら **カード・口座取込 ＞ 支払の消込** で銀行明細と結ぶ（結ばないと二重計上になります）
   5. **スタッフへの周知**: 入れるのは「いつ・何を・いくら・どうやって払ったか」だけ。科目に迷ったら【わからない】。
      納品書は**伝票番号**を入れて、紙はこれまでどおり保管してください
   6. 次の判断: **お金の画面を見せたくないスタッフがいるか**。Money OS のアクセスは Shift Cloud の店舗配属を
      そのまま使っているので、配属されている人は自店舗のお金の画面を開けます（従来からの仕様）

A-190. **FRANK 体験予約の生年月日（#190）を動かす**
   1. ~~Supabase で migration `0137_trial_birth_date.sql` を流す~~ **✅ 適用済み（2026-09-01・MCP）**
   2. **`.\deploy-frank-birth-190.ps1` を実行**（commit & push）
   3. 動作確認: `frankgolf.jp/trial-booking.html` で日時を選ぶ → お客様情報に **生年月日（年/月/日）** が出る →
      空のまま送ると「生年月日をご入力ください」で止まる → 入れて予約 →
      member-os の受付台帳にその方の行ができ、**来店時の受付フォームに生年月日が入った状態**で開く
   4. **打刻は開発不要で今すぐ使えます**（URLはこの回の回答に記載・Vault「FRANK 店頭タブレット（店舗ダッシュボード/打刻）」にも記録あり）。
      受付のタブレット／PCでそのURLを開いてホーム画面に追加してください
   5. 次の判断: 打刻画面に**スタッフではないアカウント「FRANK GOLF姫路」**（店舗ログイン用）が人として並びます。
      消すとログインが壊れるので、隠すには「人かどうか」の区別を staff に持たせる小さな改修が要ります。要否をご判断ください

A-189. **FRANK 予約の会員検索＋注文の通知音（#189）を動かす**
   1. **`.\deploy-frank-orders-189.ps1` を実行**（commit & push・migrationはありません）
   2. 動作確認（予約）: member-os `/reservations` →「予約を作成」の **会員** 欄に「やまだ」や「FR00」と打つ →
      候補が出る → 選ぶ → 打席・開始時刻・利用時間を決めて【＋ 予約を登録】→ 一覧に**会員として**出る
   3. 動作確認（音）: `/orders` を受付iPadで開く →【音をONにする】（**1回鳴ります＝押せた合図**）→
      【テスト再生】で店の音量を確かめる → お客様側から1品注文 → 長いチャイムが鳴る →
      **提供済みにせず3分待つ** → もう一度鳴る（音が低い＝鳴らし直し）・カードが赤くなる
   4. 次の判断: **音量がまだ足りない場合**は iPad 本体の音量と、必要なら外付けスピーカーをご検討ください
      （ブラウザから出せる音量の上限まで上げてあります）

A-188. **FRANK お客様の入口を my.frankgolf.jp に一本化（#188）を動かす**
   1. **`.\deploy-frank-portal-188.ps1` を実行**（commit & push・migrationはありません）
   2. **Vercel(member-os) の環境変数を確認** — `NEXT_PUBLIC_PORTAL_URL = https://my.frankgolf.jp`（#154 で設定済みのはず）と
      `GENESIS_URL`（未設定なら既定の `https://yozan-genesis.vercel.app` を使うので、そのままでも動きます）
   3. 動作確認（お客様側）: `my.frankgolf.jp/member/login` → ログイン → **【＋ 打席を予約する】がポータルの中で開く**（別サイトに飛ばない）→
      枠を選んで予約 → 会員ページの「これからのご予約」に出る → 「設定・お手続き」に **月会費のカード登録** が出る
   4. 動作確認（スタッフ側）: member-os `/frunk` の承認待ちに **決済の状況**が出る → 【Squareで入金を確認】を押すと
      入金の有無・金額・日時が出る → 入金があれば【入金を確認して入会を確定】で会員番号＋控えPDFのメールまで進む
   5. **簡易ログインQRのポスターを印刷して掲示** — `FRANK_GOLF_出店計画/FRANK_会員ポータルQR_A4.pdf`（A4・受付とラウンジ）
   6. **iCloud宛の未達を確かめる** — Resend（https://resend.com・Googleアカウントでログイン）の **Logs** で該当アドレスを検索し、
      **Delivered / Bounced / Complained** のどれかを見る。
      ・Delivered → 相手の**迷惑メールフォルダ**。お客様に確認をお願いする
      ・Bounced → 理由が出るのでそれに従う
      ・そもそも記録が無い → **無料プランの上限（月3,000通）**かドメイン認証が外れていないかを確認
      ※ frankgolf.jp の SPF / DKIM / DMARC は 2026-09-01 に実測して**正しく揃っている**ことを確認済み（送信元の設定は原因ではない）
   7. 任意（推奨）: お名前.com の DNS で `_dmarc.frankgolf.jp` を
      `v=DMARC1; p=none; rua=mailto:info@frankgolf.jp` に変更すると、**どこで弾かれたかの週次レポートが届く**ようになります

A-187. **FRANK 打席予約の00分スタート＋25分パーソナル（#187）を動かす**
   1. ~~Supabase で migration `0136_frank_bay_lesson_option.sql` を流す~~ **✅ 適用済み（2026-09-01・MCP）**
   2. **`.\deploy-frank-hourly-187.ps1` を実行**（commit & push）
   3. 動作確認: frankgolf.jp/booking.html → 枠の列が **1時間ごと**・利用時間が **1時間/2時間** の2つだけ →
      ○を押すと下に「**パーソナルレッスン（25分）を追加する ＋2,500円**」が出る → チェックして予約 →
      member-os の予約管理の上部に「**ご希望 ◯件 未確定**」が出る → 担当プロと開始時刻を入れて【確定】
   4. 次の判断: **レッスン料金2,500円の請求方法**（当日精算のままにするか、打席の `amount` に足して未収管理に載せるか）。
      いまは料金を `lesson_option_fee` に持つだけで、売上台帳・未収金には自動では乗りません
   5. 次の判断: **確定したレッスンをコーチの給与（パーソナル手当2,500→2,000円/件）につなぐか**。
      GOLF WING は money-os の売上台帳から自動集計しています（#105）。FRANK は現在つながっていません

A-186. **フィッティング予約 → 受付台帳の連携（#186）を動かす**
   1. ~~Supabase で migration `0135_fitting_walkin_link.sql` を流す~~ **✅ 適用済み（2026-08-29・MCP）**
   2. **`.\deploy-fitting-ledger-186.ps1` を実行**（commit & push）
   3. **いま止まっている申込を片付ける** — R-0004 中清様（8/25申込・第1希望 8/29 13:30）は **pending のまま4日** 経ち、
      当日ご来店されて台帳は手入力で作られています。Reserve OS で **完了**（または実態に合う状態）に直してください。
      R-0005 谷川様（メールが `@golfwing.jp`）はテスト投稿と思われます。テストなら**キャンセル**にしてください。
   4. 動作確認: Reserve OS で1件【確定】→ 店舗ダッシュボード上部の「本日のフィッティング」に出る →【来店】→
      **お名前・電話が入った受付フォーム**が開く → 住所と署名だけ入れて送信 → member-os の受付台帳にその行が更新されている
   5. 次の判断: フィッティング件数を「確定ベース」のままにするか「実来店（`arrived_at`）ベース」に変えるか


A-182. **Genesis ホームの会話型AI（JARVIS・#182）を動かす**
   1. ~~Supabase で migration `0133_genesis_jarvis.sql` を流す~~ **✅ 適用済み（2026-08-28・MCP）** — `gn_jarvis_turns` / `gn_dev_requests` 作成済み
   2. **`.\deploy-genesis-jarvis-182.ps1` を実行**（commit & push）
   3. **Vercel(genesis) の環境変数に `GEMINI_API_KEY` を追加** — lesson-os / swing-cortex で使っているものと同じキーで構いません。
      入れると声が高品質になります。**未設定でもブラウザ内蔵の音声で喋る**ので、後回しでも動きます。
      さらに良い声にしたい場合だけ `OPENAI_API_KEY` を入れてください（あればそちらが優先されます）。
   4. 動作確認: Genesis のホームを **Chrome か Edge** で開く → 開いた瞬間に喋る → 🎤 を押して「今月の売上は？」と話しかける。
      「◯◯を直して」と話すと `/dev-requests`（開発依頼）に指示書が積まれます。
   5. ~~スケジュールタスクの端末接続を承認する~~ **✅ 別方式に変更（#183）** — 承認が下りなかったので、
      **クラウドが実装してパッチを書き戻し、PCが取り込む**形にしました。下の A-183 を見てください。

A-183. **開発依頼キューの取り込み口を用意する（#183）**
   1. **`.\deploy-dev-queue-183.ps1` を実行**（migration 0134 は適用済み）
   2. **合言葉を1回だけ置く** — Vercel の `yozan-genesis` > Settings > Environment Variables から `CRON_SECRET` の値をコピーして:
      ```powershell
      New-Item -ItemType Directory -Force "$env:USERPROFILE\.yozan" | Out-Null
      Set-Content -NoNewline "$env:USERPROFILE\.yozan\dev-queue.key" "<CRON_SECRETの値>"
      ```
      ⚠ リポジトリは public なので、合言葉は絶対にリポジトリの中に置かないでください。
   3. 以後の運用: ホームでJARVISに「◯◯を直して」と話す → 毎時のクラウドタスクが実装して検証まで通す →
      通知が来たら `.\apply-dev-queue.ps1` を実行（取り込み→push→デプロイ）。中身だけ見たいときは `-DryRun`。




A-154. **FRANK 会員ポータル #154 の稼働に必要な作業（9/2まで）** — 正典 `docs/modules/frank/MEMBER_PORTAL_構想.md`
   1. ~~Supabase で migration 0123 を流す~~ **✅ 適用済み（2026-08-26・MCP／メニュー24品も投入済み）**
   2. ~~`.\deploy-frank-portal-154.ps1` を実行~~ **✅ push済み（2026-08-26）**。続けて **`.\deploy-frank-portal-155.ps1`**（#155・PWA／自動チェックアウト／打席QR印刷／店舗解決のバグ修正）を実行してください。
   3. **`my.frankgolf.jp` のDNS設定** — ~~Vercelへのドメイン追加~~ **✅ 済（2026-08-26・#158）**。残りは **CNAME 1本だけ**:
      お名前.com Navi（navi.onamae.com・お名前ID 40836651）→ ネームサーバー/DNS設定 → ドメインのDNS設定 → frankgolf.jp →
      DNSレコード設定 → **ホスト名 `my` ／ TYPE `CNAME` ／ VALUE `cname.vercel-dns.com`** を追加 → 確認画面へ進んで設定する。
      ⚠ ブラウザに保存されているNaviのパスワードは古く、ログインに失敗します（Vaultの hiro1025 で入り直してください）。
      反映後 https://my.frankgolf.jp が開けたら教えてください（`NEXT_PUBLIC_PORTAL_URL` の設定と打席QRの刷り直しをこちらでやります）。
   4. ~~公式LINEのURLを env に入れる~~ **✅ 完了（2026-08-26）** — `https://lin.ee/Xl0L2k7` を `NEXT_PUBLIC_FRANK_LINE_URL` に設定・再デプロイ済み。ポータルに公式LINEボタンが出ます。
   5. **⚠ 利用規約・入会フォームに「登録カードからの自動決済」の同意条項を追加** — **文案は `docs/modules/frank/規約_モバイルオーダー同意条項_案.md` に用意しました**（規約の条項／入会フォームのチェックボックス／既存会員への周知文／店頭掲示）。
      モバイルオーダーは注文した瞬間に登録カードへ課金するので、同意が要ります。**既存会員への周知も必要**。
   6. **Tera 9200 が届いたら**: 受付PCにUSBで挿す → 付属の設定バーコードで **末尾Enter（Suffix=CR）** を入れる →
      `/checkin` を開いてスタッフでログイン → 会員のQRをかざして名前が出るか確認。
      あわせて説明書に「USB COMポート／仮想シリアル／RS232」の設定バーコードがあるか見てください（将来の切替用・今は不要）。
   7. **打席QRステッカーを作って貼る** — **`/orders/qr` を開いてそのまま印刷できます**（打席1枚ずつ）。
      URLは開いているホストから作るので、独自ドメインが未設定でもそのまま使えます。
      ドメインが通ったら Vercel `member-os` に `NEXT_PUBLIC_PORTAL_URL` = `https://my.frankgolf.jp` を入れて刷り直してください。
      稼働中の打席コードは **`bay-a`（A打席）/ `bay-b`（B打席・左右打席）/ `bay-c`（C打席）** の3つ（`bay-d` は未設営でclose）。
   8. **実カード1件でテスト**（月会費の本番切替テストと兼ねる・**順番が大事**）:
      ⚠ 現時点で保存カード（square_customer_id）を持つ会員は**0名**＝モバイルオーダーの自動決済はまだ誰にも発動せず、全員「退店時会計」になります（2026-08-26 確認・#157）。
      ① まず A-00 のSquare本番切替（実カードで月会費テスト）→ その会員に square_customer_id が入る
      ② その会員でポータルから1品注文 → Square に決済が立つか → Money OS に **category='店内飲食'** で載るか → `/orders` に「決済済」で並ぶか。
      なおスタッフのチェックインテストは今すぐできます: `/checkin` を開き、既存会員4名のQR（または16桁）で確認（トークンは発行済み・#157）。
   9. **モバイルオーダーの公開はオペが落ち着いてから**（構想 §7）。まずチェックインと電子伝票だけで数日回してください。
   9b. **ポータルのアイコン**（ホーム画面に追加したときに出るもの）は暫定です。FRANKのロゴ画像（正方形・512px以上）があれば送ってください。差し替えます。
   10. PayPay 申請（ユーザー）＋ 電子マネー/QR の残り申請。
   11. ~~レジ商品の反映~~ **✅ 完了（2026-08-26・#159b）** — ビジター利用料5,500／体験3,300／レッスン単発2,500 をSquareに投入済み（入会金・休会費は既存のためスキップ）。
       今後レジ商品を足すときも、運用API `/api/public/frank/admin/square-catalog-sync` でこちらが投入します。**トークンを手元にコピーする必要はありません。**
       ⚠ ただし **Vault にトークン本体は未保存**のままです。Vercel(yozan-genesis)→Environment Variables→`SQUARE_ACCESS_TOKEN` は type=encrypted なので**値を表示できます**。一度 Vault「スクエア」に控えておいてください。
   12. **既存会員4名への周知** — モバイルオーダー公開前に、規約改定（第9条）とカード自動決済の周知文（`docs/modules/frank/規約_モバイルオーダー同意条項_案.md` §3）を公式LINE/メールで送ってください。新規入会はフォームの同意チェックで担保済み（#158）。


A-001. **Caddy OS 外部連携API のトークン設定**（3分・APIを使うときだけ必要 / DECISIONS #140）
   Vercel → プロジェクト `caddy-os` → Settings → Environment Variables に追加:
   `CADDY_API_TOKEN` = ランダムな長い文字列（生成例: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`）
   → Deployments → 最新 → ⋯ → Redeploy。未設定でも画面は動きます（`/api/v1/*` だけが401になります）。
   設定後の疎通確認: `curl -H "Authorization: Bearer <トークン>" https://caddy-os-hironobu-s-projects.vercel.app/api/v1/partners`

A-002. **キャディへのシフト希望提出URLの配布**（DECISIONS #140）
   Caddy OS → 設定 → 委託先（キャディ）の各行にある「提出URLを発行」→ コピー → LINEで本人へ送付。
   本人はそのURLをスマホのホーム画面に追加しておけば、毎月そこから希望日をタップするだけになります。
   URLが漏れたときは同じ行の「再発行」を押すと旧URLは即座に無効になります。

A-000. **PRO SITE（榎本剛志オフィシャルHP #137・2026-08-14）のenv設定**（5分・これだけで公開完了）
   Vercel → プロジェクト `pro-site` → Settings → Environment Variables に2つ追加（値は member-os 等の既存プロジェクトと同じ）:
   `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
   → Deployments → 最新 → ⋯ → Redeploy。完了すると https://pro-site-eight.vercel.app/enomoto が表示されます。
   管理ログインのパスワードは Vault（PRO SITE）参照。写真（ヒーロー/プロフィール）と戦歴・クラブは榎本プロからもらって管理画面で入力。

A-00. **FRANK GOLF 9/2オープンの残作業（#118→#123更新・2026-08-10。手順の正典 = OPERATIONS §14）**
   開発側は完了（予約・課金・レッスン・CMS・タブレット・LINE配信・Square一本化・月会費自動計上・確認/リマインダーメール・特別営業日）。残りは全部ユーザー作業:
   1. **Square一本化の仕上げ（最重要・9/2まで・#123/#124でStripeは廃止）**: Square法人確認の完了 →
      Developer でアプリ作成・Production Access Token 取得 → `scripts/frank-square-setup.mjs` 実行
      （プラン5種・ドリンク24品・入会金/休会費のレジ商品・Webhookを自動作成）→
      Vercel env（yozan-genesis に3つ＋**member-os に SQUARE_ACCESS_TOKEN**）＋frunk_plans 更新 → §14-1のテスト
      ※ **✅Square側は設定済み（プラン5種にvariation紐付け済み・2026-08-10）**
      ※ **#136: 通しテストは `https://member-os-tau.vercel.app/join-web?test=1` の「テスト会員」（実カード220円）で。**
        手順と後始末は OPERATIONS §14-1「入会フローの通しテスト」
      ※ Stripe の本番切替・sk_live 差替えは**不要になりました**
      ※ 入会金10,000円/クーポン6種/休会2,000円/プラン変更週割は #124 で実装済み（手順も §14-1）
   2. **Square端末（Terminal 約4.6万円）の調達**（お盆前推奨）。導入までは店頭台帳運用
   3. **Resendで frankgolf.jp をドメイン認証**＋ yozan-genesis に RESEND_API_KEY / FRANK_MAIL_FROM（§14-3）→ 体験の確認・前日リマインダーメールが動き出す
      - **⚠#120追加: 同じ2つのenvを Vercel(member-os) にも設定**してください。入れないと**Web入会申込の受付メール・入会承認メールが飛びません**（申込・承認自体は成立します）
      - ~~承認時に会員番号を伝えるメールは未実装~~ **✅ #123で実装**（承認と同時に会員番号＋カード登録案内をメール。Resend設定が前提）
   4. **FRANKスタッフLINEグループへOA追加**（1分・店舗別朝連絡の宛先になる）／FRANK公式LINE開設したら site-data.js の links.line へ
   5. **サイトの「近日公開」埋め**（下記A-0）と法務3ページ確定（A-0d）
   6. **D打席設営後**: frunk_bays を active=true / trial_priority=4 に
   7. **スタッフ周知**: 文面3本作成済み（`FRANK_GOLF_出店計画/12_オープン前スタッフ周知_0902.md`）→ 承認してLINEグループへ
   8. 内覧会をやる場合: /site-admin → 予約設定 → **特別営業日** に日付を入れるだけ（開発不要）

A-0f. **FRANK GOLF のシフトテンプレートを登録する**（#132・5分）
   0111 で既存の勤務テンプレ（早番/遅番/終日/フロント＝11:00-20:00系）は **GOLF WING 宝塚専用**にしました。
   FRANK GOLF は営業時間が違うため、いま FRANK スタッフの提出画面には「休み」しか出ません（時間の直接入力は可能）。
   → Shift Cloud ＞ 管理 ＞ **シフトテンプレート** で、**対象店舗＝FRANK GOLF 姫路** を選んで早番・遅番などを追加してください。
   「全店共通」にすると宝塚の画面にも出ます。

A-0g. ~~migration 0112 を適用する~~ **✅ 完了（2026-08-22・Claudeが Supabase MCP で適用＋refresh_member_kpis 実行済み）**: kpis に店舗行ができ、宝塚=体験7件/成約率57.1%、FRANK=0件（9月の体験予約13件はまだ未来日なので0で正しい）。「店舗を特定できない会員」の警告が出たら mbr_members.store_name の表記ゆれを直す。

A-0. **FRANK GOLF ホームページの未確定情報を埋める**（`sites/frank-golf/assets/site-data.js` の1ファイルのみ・9/2プレオープンのブロッカー）
   - 現在 **null＝画面に「近日公開」と表示中**の項目: 住所 / 電話 / 営業時間 / 定休日 / 駐車場 / アクセス / 打席数 / シミュレーター機種 / 料金（会員3プラン・入会金・体験料・ビジター料）/ レッスン内容・コーチ / ラウンジ（ドリンク/フード/席数/時間）/ プレオープン特典
   - **公式LINEのURL**（`links.line`）— 未設定だと「公式LINEで相談」ボタンが押せません。CTAの半分が死ぬのでこれが最優先
   - **体験予約URL**（`links.trialBooking`）— member-os →「予約（姫路）」→【お客様Web予約URLを発行】で取得して貼る。**未設定の間は体験予約ボタンが公式LINEへ自動フォールバック**します
   - 決まっていない項目は null のままで問題ありません（勝手な数字は出しません）

A-0e. ~~member-os をデプロイ~~ **✅ 完了確認（2026-07-24 / #76）**: `/trial` は本番稼働中（体験申込0件の原因は導線でなく集客＝P2営業ループで対応）。以下は参考として残す
   - 新規ルート: `/trial`（体験申込・公開）／`/join-web`（Web入会申込・公開）／スタッフ `/trials`（体験申込一覧・ナビ「体験申込」）
   - デプロイ = member-os のGitに push → Vercel(member-os)が自動ビルド（envは既存のまま／追加不要）
   - デプロイ後: HPの「体験を申し込む」→ `/trial`、「Webで入会」→ `/join-web` が有効化（site-data設定済）
   - スタッフ導線: 申込は member-os の**「体験申込」タブ**に入る（日程確定/来店済/キャンセル操作）。Web入会申込は既存**「FRANK会員」**の pending として届き、承認で会員番号発行
   - 通しテスト: `/trial` と `/join-web` から自分で1件送信 → スタッフ画面に出るか、承認できるか確認
   - 任意: 申込到着をLINE/メール通知したい場合は後続（現状は画面確認）
   - HP公開ドメイン確定後、`apps/member-os/src/lib/site.ts` の `SITE_URL` にHPのURLを入れて再デプロイ → Web入会/体験フォームの「会員規約」「プライバシーポリシー」リンクが有効化（空の間はリンク無しのテキスト表示）

A-0b. **Web入会（決済を伴う入会）の要否判断** — member-os の `/member/register` は**「Web予約を使うための会員登録」であって、プラン契約・決済を伴う入会ではありません**。HPの「ウェブ入会」導線は現状これを指しています。本当に決済まで必要なら別途設計が必要（DECISIONS #66 の未解決事項）

A-0c. **FRANK GOLF HP のVercel公開** — `sites/frank-golf`（静的・ビルド不要）。Root Directory を `sites/frank-golf`・プリセット Other で新規プロジェクト作成 → 公開後 **vault_systems に登録**（OPERATIONS §Vault）
   - **公開ドメインが決まったら `sites/frank-golf/_build.py` の `SITE_URL` に入れて `python3 _build.py` を再実行**。空のままだと **公式LINEでURLを送ってもOGP画像が出ません**（LINE/X/Facebookは og:image に絶対URLを要求）。`sitemap.xml` の生成もこの設定が前提

A-0d. **特商法・プライバシーポリシー・会員規約の法務確認** — `sites/frank-golf/tokushoho.html` / `privacy.html` / `terms.html`（会員規約・休会/退会規定含む）は**草案**（画面にも「準備中の草案」と明示済み）。運営統括責任者・所在地・支払方法・返品/退会条件が未記入。**Webでの入会申込・決済を開始する前に確定と専門家確認が必須**

A-1. **小川うららのアカウント発行** — DB上 `staff.auth_user_id` が null ＝**未発行**（ロール「役員（本部閲覧）」は付与済み）
   - Shift Cloud管理画面 → スタッフ → 小川うらら編集 → 初期パスワード（8文字以上）設定 → 保存
   - 発行後: GENESIS(/manual・/library)を触ってもらう。共有パック docs/genesis/ONBOARDING_EXEC.md

A-2. ~~コーチへ `use_lesson` 権限を付与~~ **✅ 完了（2026-08-22）**: ロール「コーチング（店舗）」(`5f45104c-f6cc-413f-9f99-97b59889dc88` / 株式会社YOZAN) に `use_lesson` を追加。穴田賢太さん・藤田晃規さんがLesson OSを開けるようになった（FRANK配属なのでFRANKの生徒4名だけが見える）
   - **⚠ ロールの権限を編集する画面が無い**（/admin/staff・/accounts は「割り当て」だけ）。今回はDBを直接更新した。同名ロールが2つある点にも注意（もう1つ `357dab28…` は別テナントFRANK GOLF社）
   - 副作用: 同ロールを持つ「デモ（SWING CORTEX）」アカウントもLesson OSのメニューが出る。店舗未配属なので**生徒は0件**だが、気になるなら別ロールに分けること

A-2c. **ロール・権限の画面ができました（#142）** — Shift Cloud → 左メニュー「ロール・権限」（オーナーのみ）。以後、権限の増減はこの画面から。DB直編集は不要
   - 同名ロールが2つある「コーチング（店舗）」は赤バッジで警告が出ます。ID先頭8桁で見分けてください

A-2b. **Vercel `lesson-os` に `ANTHROPIC_API_KEY` を追加** → Redeploy（#141・トラックマン写真のAI読取に必要。未設定でも計測タブは手入力で使える）
   - 値は genesis と同じ。読取精度が足りないときだけ `LESSON_AI_MODEL` でモデルを上げる（既定 `claude-haiku-4-5-20251001`）

A-3. **Reserve OS の通しテスト** — `res_requests` **0件**＝一度も申込が通っていない
   - https://shift-cloud-reserve-os.vercel.app/reserve/shaft-fitting で申込 → GOLF WING宛に通知メール到達 → /login（use_reception|view_hq）→ /requests で確定メール送信 まで
   - Resend（APIキー・送信ドメイン認証）と env（RESERVE_FROM_EMAIL / RESERVE_STAFF_EMAIL / NEXT_PUBLIC_SITE_URL）が効いているかもここで判明する
   - 通ったら 公式LINEのリッチメニュー/トークに `/reserve/shaft-fitting` を掲出

A-4. ~~LINE公式アカウント Phase 0~~ **✅ 送信側 開通（2026-07-25 / #80）**: 長期トークン3本（スタッフ/GWビジター/GW会員）受領→ gn_line_channels(0076) に保存済・line_broadcast実配信化・営業ループが顧客直接配信に切替済
   - ~~channel secret＋webhook実装~~ **✅ 実装済（#81）**: secret3本受領・`/api/webhooks/line/[code]` 稼働
   - **残（ユーザー・各1分）: LINE DevelopersコンソールでWebhook URLを設定** — 各チャネルの Messaging API設定 → Webhook URL に `https://yozan-genesis.vercel.app/api/webhooks/line/staff`（スタッフ用）/ `.../gw_visitor`（ビジター用）/ `.../gw_member`（会員用）を貼り「Webhookの利用」をON→「検証」

A-5. **営業利益の目標値** — 5大KPIのうち営業利益だけ target が未設定（会員数/入会率/退会率/月次売上は設定済）

A-6. **Lesson OS 実機確認**（2026-08-22時点で生徒1件・動画2件＝ほぼ未使用。FRANK会員4名のカルテは 0119 で自動生成済み）
   - スマホで 生徒登録→撮影→描画→進捗→共有リンク(/s/) をLINEで自分に送って確認
   - #143の追加分: カルテの【📹 スイングを撮影する】1ボタンで撮影→クラブ入力→登録まで終わるか ／ 一覧に1コマ目のサムネイルが出て、押すとすぐ再生されるか（電波の弱い場所でも一覧が軽いか）
   - #141の追加分: member-os の予約カレンダー→予約をタップ→「レッスンカルテを開く」でその会員のカルテが開くか ／「計測」タブでトラックマン写真から数値が入るか（A-2bのenvが前提）／ FRANK会員を退会にすると一覧から消え「退会者も表示」で戻るか

A-7. **AI DEMO SALES のenv設定（Vercel: demo-sales）** — 新アプリのデプロイに必要（#54）
   - Vercelプロジェクト `demo-sales`（Root=apps/demo-sales）に env 3つ: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY（他アプリと同値）＋ NEXT_PUBLIC_SITE_URL（デモURL用・デプロイ後の本番URL）
   - 権限 `use_demo_sales` を営業担当ロールへ付与（view_hqの古川さんはそのまま入れる）

A-8. **店舗ダッシュボードの実機確認（#75）** — 店頭PCのブラウザで `/store/<デバイストークン>` を開く（打刻キオスク `/kiosk/〜` と同じトークン。URLの kiosk を store に変えるだけ）
   - 確認: 店舗切替（GOLF WING⇄FRANK）/ KPIカード4種 / カレンダーの出勤者表示 / やること追加→完了 / 業務リンク10件が飛べるか
   - FRANK店頭にも表示端末を置く場合: Shift Cloud管理画面からFRANK用キオスク端末を発行（同トークンで/storeも開ける）

## B. 明日の朝に判定すること

B-1. ~~日次レポートの自動生成~~ **✅ 判定済み（2026-07-19）**: 7/15朝以降、7/16朝を除き毎朝6:00 JSTに生成＝復旧。タイトル日付が1日ズレていたのは #73 で修正（UTC→JST）

## C. Claude作業（未着手）

C-0. ~~【#61の配線】自律実行 executor~~ **✅ 実装済み（#62 / migration 0062）**: `lib/ai-execution.ts`（enqueue/runDue/cancel/approve＋ハンドラ登録）・`ai_action_queue`・`/api/cron/execute`(10分)・`/executions` UI。(a)モード解決・(b)auto/auto_undo/approval実行・audit_logs記録・(c)取消/承認UI・(d)は下記で継続。
   - ~~(a′) 生成側の配線~~ **✅ 実装済み（#63 / migration 0063）**: CEO AI日次→スタッフ朝連絡(staff_directive・試運転approval)、CEO指示→agent_directive(auto)、成果物承認→internal_notify(auto)。
   - **残: (a″) 実チャネル接続後の実送信化** — 成果物承認の internal_notify を sns_post 等の実送信へ差し替え（要SNS/顧客チャネル）。staff_directive を試運転approvalから auto_undo に緩めるかの判断。
   - **残: (d) `prod_deploy`** を Vercel MCP に接続（承認後にClaudeがデプロイ）。
   - 動作確認: /executions →「テスト実行を入れる」→2分後に自動実行 or その場で「取消」。日次レポート生成後は「スタッフ朝連絡」が承認待ちで並ぶ→承認でLINE配信。
C-1. ~~RUNBOOK未作成~~ **✅ 完了（2026-07-19 / #73）**: money-os / survey-os / reserve-os / caddy-os のRUNBOOK作成→各アプリ /manual 配信＋ログイン画面にリンク追加

C-2. **Genesis大改修（#76/#77・正典 REDESIGN_2026-07.md・P1＋P2前半実装済）** — 残フェーズ:
   - ~~P2前半~~ **✅ 完了（2026-07-25 / #77）**: ループ基盤（0075）＋営業AIループv1（sales-loop.ts・日次cron接続）＋ルール改訂（AI_RULES/DEVELOPMENT_RULES）
   - ~~P2後半~~ **✅ 完了（2026-07-25 / #78）**: Web入会承認のホーム完結・判断SLA・/chatタブ統合・事業別を/financeへ・prod_deployハンドラ（VERCEL_DEPLOY_HOOKS env待ち=任意）・OPERATIONS改訂方針
   - ~~P3前半~~ **✅ 完了（2026-07-25 / #82）**: 測定学習（配信→7日実測→result保存→ティッカー）＋稼働化プログラム（週次月曜・利用ゼロ検知→稼働化/凍結の提案起票）
   - ~~P3後半~~ **✅ ほぼ完了（2026-07-25 / #83）**: イベント一元化(0079トリガー)・AI週次成績表・朝の個人LINEダイジェスト（宛先=スタッフ用OAに古川さんが1:1で一言送ると自動設定）・朝連絡の実務化・事業別収支内訳・キャディ財務修正(0078)
   - ~~残~~ **✅ 完了（2026-07-25 / #84）**: 会員集計の正典を@yozan/core/membersへ・朝連絡に持ち越し（未完了再指示）欄・小川氏1.1Mは貸付返済＝PL対象外に訂正

2. ~~FRANK GOLF 9/2プレオープン~~ **✅ 開発全部完了（#118・2026-08-07）** — 正典 `FRANK_GOLF_出店計画/10_プレオープン実行計画_0902.md`
   - ✅ §3-5 LINE配信 ／ ✅ §3-1 HP＋CMS ／ ✅ §3-3 予約 ／ ✅ §3-2 Stripe（invoice.paid→Money OS計上まで）／ ✅ §3-4 レッスン ／ ✅ §3-7 Square受信側 ／ ✅ 確認・リマインダーメール ／ ✅ 特別営業日
   - 残りはすべてユーザー作業 → **A-00 を見る**（手順の正典 OPERATIONS §14）

C-3. **Lesson OS 後続**: P2b＝GOLF WING Finder連携（コメントに診断ナレッジ）・会員名簿突合・KPI接続 / P3＝Trackman CSV取込・レッスンAI
   - 確認事項（ユーザー）: WING NOTEに過去データのエクスポート機能があるか（あれば移行、なければ新規蓄積）

C-3. **SaaS化（正典 docs/genesis/SAAS_PLAN.md）**: Phase S0＝FRUNK GOLF姫路を2店舗目テナントとして発行（ウィザードの要件出し） / AI設定コンシェルジュ試作（/concierge） / **リポジトリPrivate化が販売の前提**

C-4. **Money OS**: 経費自動起票（OCR精度の実績待ち。`mon_receipts` は0件＝運用未開始）／mon_expense・mon_bank_txn との突合UI強化

C-5. **スタッフポータル後続（STAFF_PORTAL.md §6）**: 店長タスク配信 / Genesis判断リスト→sp_tasks自動配信 / 予約ソース実接続。※日報→**イレギュラー報告は #125 で完了**（sp_incidents + Genesis /incidents。残はユーザー作業＝公式LINEへ1回送信して通知先リンク＋スタッフ周知）

C-6. **Survey OS フェーズ3**: 条件分岐 / KPI接続（回答率・満足度）/ n8n連携（GOLF WINGアンケートは公開中・回答2件）

C-7. **モバイル対応**: 実機で崩れが残る画面の個別調整（ユーザーからの報告ベース）

C-8. **掃除（軽微）**
   - マイグレーション番号重複（0024が legal_os / reservation_payments の2本）→ いずれか0046+へリネーム
   - GolfOrder切替儀式: D1差分同期 → 切替宣言 → 旧Pages `golfwing` 停止 → import関数削除
   - Cloudflareで旧Pagesのカスタムドメイン解除（`yozan-group`／`kallinos`）※`golfwing`は本番稼働中なので触らない
   - Member OS 通しテスト（予約→タブレット受付→/intake自己入力→入会）

C-11. **ホームページ営業の自動化 ①→②（#95・正典 docs/modules/track/SYSTEM.md）**
   - ③閲覧トラッキング（@yozan/track）は完了。次は **① `@yozan/prospect`** — URL→Web現況スコア（SSL/viewport/最終更新年/予約導線/PageSpeed）＋リスト取得アダプタ（Places API or 公的名簿）。スコア上位から自動でデモ生成まで繋ぐ
   - **② `@yozan/outreach`** — 送信・配信停止トークン・抑止リスト（永久ブロック）・法定表示の自動付与・日次スロットル。着手時にメール基盤（Resend＋送信専用ドメイン／既存サーバー）を決める
   - 法務メモ: 特定電子メール法3条1項3号（サイトにアドレスを公表している営業者は同意不要・「営業メールお断り」表示のある先は除外）／4条の表示義務（送信者名・住所・配信停止先）
   - ①の前に、いまの13件で③の効果（開封率・架電の繋がり方）を確認する

C-10. **AI DEMO SALES 後続（#54・正典 docs/modules/demo-sales/SYSTEM.md §6）**
   - 残り12件の営業先の現サイト分析＋スコア＋デモ生成（サンプル1件=福本クリニックの型を踏襲）
   - 営業指示（directive）の処理をセッション開始時の定型に組込み / 現サイト自動分析のcron化（#40の1件/日方式）
   - 成約率KPI画面・dms_plans管理画面（データが貯まってから）

C-9. **Shift Cloud 実運用フィードバック**の収集と改善バックログ化

---

## SWING CORTEX（GOLF WING Finder後継 / コーチング診断SaaS）— P1実装済み（2026-07-22）

正典: `docs/modules/swing-cortex/SYSTEM.md` ＋ プロトタイプ `docs/modules/swing-cortex/prototype.html`

- ✅ **migration 0069_swing_cortex.sql**（sc_* 9テーブル・RLS・updated_atトリガ・starter知識シード）作成済。**未適用**（適用はユーザー実行）
- ✅ **apps/swing-cortex 雛形**（Next.js 15 / port 3011 / @yozan/core / use_coaching|view_hq）: login・(main)[診断/ライブラリ/インサイト/設定]・manual・logout
- ✅ **Excel取込**（settings）: WING NOTE .xlsx → sc_comments ＋ ルール分類(coaching.ts)で局面×症状を sc_patterns に集計
- ✅ **クイック診断**: 症状検索→優先度順チェックポイント→原因/対処/ドリル/生徒向け説明→LINE送信(診断ログ保存)
- 検証: 22ファイル構文OK・型エラー0（@yozan/coreのTS2307はサンドボックス固有＝lesson-osも同様）

### SWING CORTEX — P2実装済み（2026-07-22・AI）
- ✅ **`lib/ai.ts`** Claudeクライアント（ceo-ai同型・ANTHROPIC_API_KEY・キー無しはテンプレfallback）
- ✅ **`findSimilarComments`**（過去コメントRAG-lite）＋ **`ai-actions.ts` `draftComment`**（学校の文体でカルテ文＋生徒LINE文をJSON生成）＋`saveKarteDraft`
- ✅ **診断シートに「コメント作成」**（所見口語入力→AI下書き→編集→保存/LINE）
- env追加: `ANTHROPIC_API_KEY`（任意`CORTEX_AI_MODEL`）。未設定でもテンプレで動く

### SWING CORTEX — P3実装済み（2026-07-22・生徒コンテキスト/CRM化）
- ✅ **migration `0070_swing_cortex_students.sql`**（sc_students＋sc_notes＝生徒別カルテ、sc_diagnoses.student_id。列名natural_text=PG予約語回避）。**未適用**
- ✅ **生徒ピッカー**（ホーム・検索/新規登録）＋選択中バナー、`/students/[id]`カルテ履歴ページ
- ✅ **パーソナライズ**：draftCommentが選択生徒の過去カルテ上位3件を文脈化／「〇〇さんのカルテに保存」（sc_notes）
- 検証：新規4ファイル構文OK、編集済はマウント陳腐化のためReadで整合確認（diagnosis-client 626行・全関数開閉一致）

### SWING CORTEX — P4実装済み（2026-07-22・エディション制＝販売切り分け）
- ✅ **migration `0071_swing_cortex_plan.sql`**（sc_settings: plan standard|pro。行なし=standard=売る仕様。自社=pro）。**未適用**
- ✅ **`lib/plan.ts` loadFeatures**（pro→studentCrm）／ホーム・設定・students・診断UIにゲート適用
- ✅ **販売版=standard**は診断＋AIコメント作成まで（P1+P2）。生徒CRM(P3)はproのみ表示。設定にPRO/STANDARDバッジ
- SaaS残（外部依存で手順化）：Stripe課金・発行ウィザード・AI設定コンシェルジュ・リポPrivate化（SYSTEM.md §12）

### SWING CORTEX — DB正典化（2026-07-22・ユーザー方針: DB=正/Excelは書出し）
- ✅ **migration `0072_swing_cortex_seed_master.sql`**：46症状/53チェック項目をDB(sc_symptoms/checkpoints/knowledge)へ投入。sc_symptoms.source追加、source=seed＋0069旧シードを掃除し冪等。**未適用**
- ✅ **DB→Excel書き出し** `GET /api/export`（設定→「項目マスタをExcelで書き出し」・SheetJS）
- Excelは台帳ではなく「seedの元／書き出しスナップショット」に格下げ。編集の正はDB
- 次: アプリ内編集UI（症状/チェック項目/知識のDB直編集）＝真のDB管理

### SWING CORTEX — アプリ内編集UI（2026-07-22・DB直編集で正典化を完成）
- ✅ **/manage**（設定→「項目マスタを編集」）：症状と確認項目(優先度/チェック項目/原因/対処/ドリル/説明)をDBで追加・編集・削除
- ✅ `manage-actions.ts`(create/update/deleteSymptom, save/deleteCheckpoint・company_idスコープ・source=manual)＋`loadManageTree`(ID付き)＋`manage-client.tsx`
- 全エディションで利用可。これで **DB管理→必要時Excel書き出し** が完結
- 検証：新規3ファイル構文OK、data.ts/settings編集はReadで整合確認

### SWING CORTEX 次アクション
1. `cd apps/swing-cortex && npm install`（xlsx取得）→ **migration 0069・0070・0071・0072 適用** → `npm run build`
2. Vercel新規プロジェクト作成＋env（NEXT_PUBLIC_SUPABASE_URL/ANON_KEY・SUPABASE_SERVICE_ROLE）→ **vault_systems登録**（[[yozan-vault-rule]]）
3. `use_coaching` 権限をロールに付与（張替/浅野/小林コーチ）
4. 添付Excel（ウィナーズ5,939件）を設定→Excel取込で投入し、インサイト/よく使う症状を実データ化
5. P2: コメント→AI構造化（Claude API）でsc_knowledge自動生成・lesson-osカルテ連携・sc_feedbackで並び最適化

---

## 完了ログ（2026-07-14 照合で確認）

- ✅ push（LSN P2 / GN役員展開 / SP / FIX / MB）: `82b3f5d`・`634dbf0` で本番反映。genesis・lesson-os とも READY
- ✅ **Survey OS デプロイ済**: https://survey-os-mu.vercel.app（`golfwing-2026` 公開中・回答2件・Vault登録済）
- ✅ **Reserve OS デプロイ済**: https://shift-cloud-reserve-os.vercel.app（Vault登録済。申込0件＝A-3へ）
- ✅ **Lesson OS 本番**: https://lesson-os.vercel.app（0041〜0044適用済・P2実装済）
- ✅ **資料室に13件投入済**（Storage `library`）
- ✅ **財務データ投入済**: `fin_entries` 133件 → 月次売上・営業利益KPIが接続
- ✅ **5大KPI目標値**: 会員数250 / 入会率50 / 退会率2.5 / 月次売上600万（営業利益のみA-5）
- ✅ **migration 0045まで全て適用済**（0044 lesson_os_phases / 0045 inbox_filter_suggestions_directives）
- ✅ Storage上限200MB・CRON_SECRET: ユーザー設定済み（実効性はB-1で最終判定）
- ✅ 基盤アップグレード（2026-07-11）: packages/core移行・RUNBOOK・時給の月中変更（日付按分 #39）・KPIチェッカー・CI
- ✅ Legal OS 本番稼働 + legal_ai 日次チェック（#40）／Money OS `mon_receipts` フェーズ1＋OCR（#41,#42）／Caddy OS（#46）／社内連絡 /notes（0040）

## Inventory OS（在庫・棚卸 / #96）

- [x] **IV-1 Vercelデプロイ**（2026-07-30）— https://inventory-os-seven.vercel.app / Root Directory `apps/inventory-os` / `INVENTORY_API_TOKEN` は Vault に発行済み
- [ ] **IV-1b env の残り2つ** — Vercel `inventory-os` → Settings → Environment Variables に `NEXT_PUBLIC_SUPABASE_ANON_KEY` と `SUPABASE_SERVICE_ROLE_KEY`（Sensitive）を追加して Redeploy。`NEXT_PUBLIC_SUPABASE_URL` は設定済み
- [ ] **IV-2 適正在庫の初期設定** — `reorder_point` が全品番 null なので発注候補が出ない。グリップ・グローブ・ボールなど回転の速いものから設定する
- [ ] **IV-3 保管場所の穴埋め** — 95件（26%）が未設定。埋めると棚卸が「歩く順」に並ぶ
- [ ] **IV-4 廃番の整理** — 在庫ゼロが続く58品番を `discontinued` に落として棚卸対象から外す
- [ ] **IV-5 golfwing 商品コードマスタ整備 → `/api/v1/movements` 連携の有効化**（ワークス発注が止まっているのと同じ前提。ROADMAP LP-001）
- [ ] **IV-6 money-os に粗利画面** — `inv_monthly_valuation`（期首/期末/仕入/売上原価）を読む
- [ ] **IV-7 report-os の物販セクション** — 在庫回転日数・死蔵在庫（SYSTEM.md §4 の宿題）
- [ ] **IV-8 inventory_ai の配線** — 適正在庫割れ → 発注候補 → `ai_suggestions`（migration 0006 で planned 済、0012 に duties 定義あり）
- [ ] **IV-9 shift-cloud /store からの棚卸導線**
- [ ] **IV-10 FRANK GOLF の物販在庫** — 9/2プレオープン。品番を FRANK の store_id で登録すれば同じ仕組みに乗る

---

## AI営業 SNSインバウンド（#101・2026-08-04）

**ユーザー作業（開通ブロッカー）**
- IG-1. Instagram接続: `IG_ACCESS_TOKEN` / `IG_BUSINESS_ID` を Vercel(yozan-genesis) に設定（OPERATIONS §9）。未設定でも生成〜承認は動く
  - **2026-08-05 状況**: 9-1（プロアカウント化・FBページ接続）完了。9-2で **Meta for Developers の開発者アカウント登録が必要** と判明 → **SMS認証の再送上限で停止中**（数時間〜24hで解除）。解除後 https://developers.facebook.com/ 右上「開始する」から再開（Verify account → Contact info → About you=開発者）。登録はユーザー作業、以降のアプリ作成・トークン取得はAIが実行可
- IG-2. Instagramプロフィールのリンクを集客LPに設定（https://yozan-genesis.vercel.app/lp/pganote など。リンクツリー併用可）
- IG-3. push前にユーザーPCで `npx tsc --noEmit`（apps/genesis）→ commit & push（OPERATIONS §1）

**X（Twitter）チャネル（#103・2026-08-05）— ✅ 実装完了・接続済み**
- X-1. ~~会社公式Xアカウント作成~~ **✅ 完了** `@YOZAN_inc`「株式会社YOZAN｜ゴルフ×AI」（全事業を1アカウントに集約）
- X-2. ~~X開発者ポータル登録＋支払い設定~~ **✅ 完了**（Pay Per Use・残高$5・自動チャージON・アプリ権限=読み書き）
- X-3. ~~Xアダプタ実装~~ **✅ 完了**（OAuth 1.0a自前署名＋POST /2/tweets・280重み自動短縮・LPは `?src=x`）。env 4つ登録済み
- X-4. ハブLP `/lp`（全事業の入口・X/IGのプロフィールリンク先を1本化）※Xは本文リンクが効くので優先度は中
- X-5. ~~Xプロフィールのウェブサイト欄~~ **✅ 完了（#104）**。アイコン・ヘッダー・固定ポストも設定済み
- X-6. X/IG の反応（インプレッション・いいね）取得cron → `cnt_posts.metrics` → /ai-sales と週次レポートへ
- X-7. 投稿頻度の最適化 — **リンク付きは$0.20/件・リンク無しは$0.015/件**。「知見だけの投稿」を朝に1本足すと、月+$0.5程度で露出をほぼ倍にできる（要design）
- X-8. Xは**承認なしで自動投稿**に変更済み（#104・`gn_loops.config.x_auto`）。戻したくなったら config を false に

**開発（次）**
- C-20. Instagram Insights取得cron（cnt_posts.metrics に reach/likes を書く → /ai-sales と週次レポートへ）
- C-21. コメント起点の自動DM（投稿に「診断」コメント→リンク自動返信。Graph API comment webhook・完全自動が合法な唯一のDM経路）
- C-22. IG長期トークンの自動リフレッシュ
- C-23. Phase 2: @yozan/prospect（Google Maps発見・DESIGN.md）→ Phase 3: @yozan/outreach → Phase 4: DM半自動
- IG-4. ~~@yozan_web_jp のプロフィール自己紹介を設定~~ **✅ 2026-08-04 完了（ユーザー）**
- IG-5. webdesign投稿の開通: `IG_ACCESS_TOKEN_WEB` / `IG_BUSINESS_ID_WEB`（@yozan_web_jp をプロアカウント化して取得・OPERATIONS §9と同手順）
