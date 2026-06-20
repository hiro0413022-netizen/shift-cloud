/**
 * GolfOrder ランディングページ
 * - ゴルフショップ向け発注管理システムの紹介
 * - モックアップUI・機能説明・Before/After・デモCTAを含む
 */
export function landingPage(appName: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName} | ゴルフショップ専用 発注管理システム</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
    body { font-family: 'Noto Sans JP', sans-serif; }
    .gradient-hero { background: linear-gradient(135deg, #0f4c81 0%, #1a7abf 50%, #22a6d6 100%); }
    .gradient-green { background: linear-gradient(135deg, #065f46 0%, #059669 100%); }
    .card-shadow { box-shadow: 0 4px 24px rgba(0,0,0,0.10); }
    .mockup-window { border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
    .mockup-titlebar { background: #e5e7eb; padding: 10px 16px; display: flex; align-items: center; gap: 6px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot-red   { background: #ef4444; }
    .dot-yellow{ background: #f59e0b; }
    .dot-green { background: #10b981; }
    .pulse-badge { animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
    .stat-card { transition: transform .2s; }
    .stat-card:hover { transform: translateY(-4px); }
    .feature-icon { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    .timeline-line::before { content:''; position:absolute; left:19px; top:40px; bottom:-20px; width:2px; background:#e5e7eb; }
  </style>
</head>
<body class="bg-white text-gray-800">

<!-- ═══════════════════════════════════════════════
     ナビバー
═══════════════════════════════════════════════ -->
<nav class="fixed top-0 w-full z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
  <div class="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 bg-blue-700 rounded-lg flex items-center justify-center">
        <i class="fas fa-golf-ball-tee text-white text-sm"></i>
      </div>
      <span class="font-bold text-blue-900 text-lg">${appName}</span>
    </div>
    <div class="flex items-center gap-3">
      <a href="/login" class="text-sm text-gray-600 hover:text-blue-700 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">
        ログイン
      </a>
      <a href="/demo-login" class="text-sm bg-blue-700 text-white font-medium px-4 py-2 rounded-lg hover:bg-blue-800 transition shadow-sm">
        <i class="fas fa-play mr-1.5"></i>無料デモを試す
      </a>
    </div>
  </div>
</nav>

<!-- ═══════════════════════════════════════════════
     ヒーローセクション
═══════════════════════════════════════════════ -->
<section class="gradient-hero pt-28 pb-16 px-4 sm:px-6 text-white overflow-hidden relative">
  <!-- 背景装飾 -->
  <div class="absolute inset-0 opacity-10">
    <div class="absolute top-10 right-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
    <div class="absolute bottom-0 left-0 w-64 h-64 bg-blue-300 rounded-full blur-3xl"></div>
  </div>

  <div class="max-w-6xl mx-auto relative">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <!-- 左：キャッチコピー -->
      <div>
        <div class="inline-flex items-center gap-2 bg-white/20 text-white text-xs font-medium px-3 py-1.5 rounded-full mb-6 border border-white/30">
          <i class="fas fa-star text-yellow-300"></i>
          ゴルフショップ専用の発注管理ツール
        </div>
        <h1 class="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-6">
          発注業務を<br>
          <span class="text-yellow-300">1/3の時間</span>に。<br>
          漏れも重複も<br>
          <span class="text-yellow-300">ゼロ</span>へ。
        </h1>
        <p class="text-blue-100 text-base sm:text-lg leading-relaxed mb-8">
          仕入先ごとのメール・FAX・LINE発注を<br class="hidden sm:block">
          一つの画面でまとめて管理。<br>
          お客様からの受注から入荷確認まで、<br class="hidden sm:block">
          ゴルフショップに特化した発注管理システムです。
        </p>
        <div class="flex flex-col sm:flex-row gap-3">
          <a href="/demo-login"
             class="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold px-8 py-4 rounded-xl text-base shadow-lg transition">
            <i class="fas fa-play-circle text-xl"></i>
            デモ画面を見てみる（無料・登録不要）
          </a>
          <a href="#features"
             class="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-6 py-4 rounded-xl text-base border border-white/30 transition">
            <i class="fas fa-chevron-down"></i>
            機能を見る
          </a>
        </div>
        <p class="text-blue-200 text-sm mt-4">
          <i class="fas fa-shield-alt mr-1"></i>デモは読み取り専用。登録・クレカ不要です。
        </p>
      </div>

      <!-- 右：ダッシュボードモックアップ -->
      <div class="lg:block">
        <div class="mockup-window bg-white text-gray-800">
          <div class="mockup-titlebar">
            <span class="dot dot-red"></span>
            <span class="dot dot-yellow"></span>
            <span class="dot dot-green"></span>
            <span class="flex-1 text-center text-xs text-gray-400 font-mono">golforder.app / ダッシュボード</span>
          </div>
          <div class="bg-gray-50 p-4">
            <!-- ダッシュボードモック -->
            <div class="flex items-center justify-between mb-3">
              <div class="text-sm font-bold text-gray-700">
                <i class="fas fa-golf-ball-tee text-blue-600 mr-1"></i>ダッシュボード
              </div>
              <div class="text-xs text-gray-400">2024年6月20日（木）</div>
            </div>
            <!-- サマリーカード -->
            <div class="grid grid-cols-4 gap-2 mb-4">
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-blue-600">12</div>
                <div class="text-xs text-gray-500">商品登録数</div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-green-600">5</div>
                <div class="text-xs text-gray-500">仕入先数</div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-orange-500">3</div>
                <div class="text-xs text-gray-500 flex items-center justify-center gap-1">
                  発注中
                  <span class="pulse-badge w-1.5 h-1.5 bg-orange-400 rounded-full inline-block"></span>
                </div>
              </div>
              <div class="bg-white rounded-lg p-2.5 text-center card-shadow stat-card">
                <div class="text-xl font-black text-red-500">2</div>
                <div class="text-xs text-gray-500">入荷待ち</div>
              </div>
            </div>
            <!-- 発注リスト -->
            <div class="bg-white rounded-lg p-3 card-shadow">
              <div class="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1">
                <i class="fas fa-clock text-orange-400"></i> 最近の発注
              </div>
              <div class="space-y-2">
                ${mockOrderRow('鈴木 一郎 様', 'WS-DR α 45S', 'ワークスシャフト', 'ordered', '6/17')}
                ${mockOrderRow('田中 花子 様', 'PS-FW Xtra 65R', 'プレミアムシャフト', 'ordered', '6/15')}
                ${mockOrderRow('佐藤 健 様', 'YG-PRO コードレス ×13', '山田グリップ', 'received', '6/10')}
                ${mockOrderRow('（店舗在庫補充）', 'ポロシャツほか2点', 'スポーツアパレル', 'ordered', '6/19')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     数字で見る効果
═══════════════════════════════════════════════ -->
<section class="bg-blue-900 text-white py-14 px-4">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-xl sm:text-2xl font-bold text-blue-100">
        導入で変わる、発注業務の「時間」と「ストレス」
      </h2>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">▼70%</div>
        <div class="text-sm text-blue-200 font-medium">発注メール<br>作成時間</div>
        <div class="text-xs text-blue-400 mt-1">30分 → 約10分</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">ゼロへ</div>
        <div class="text-sm text-blue-200 font-medium">発注漏れ・<br>重複発注</div>
        <div class="text-xs text-blue-400 mt-1">ステータスで一元管理</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">即確認</div>
        <div class="text-sm text-blue-200 font-medium">入荷状況・<br>バックオーダー</div>
        <div class="text-xs text-blue-400 mt-1">どこからでも確認可</div>
      </div>
      <div>
        <div class="text-4xl font-black text-yellow-300 mb-1">自動化</div>
        <div class="text-sm text-blue-200 font-medium">仕入先別<br>発注メール</div>
        <div class="text-xs text-blue-400 mt-1">テンプレから自動生成</div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     Before / After
═══════════════════════════════════════════════ -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-10">
      <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-2">導入前と後の違い</h2>
      <p class="text-gray-500">毎日の発注作業が、こう変わります</p>
    </div>
    <div class="grid md:grid-cols-2 gap-6">
      <!-- Before -->
      <div class="bg-white rounded-2xl p-6 card-shadow border-l-4 border-red-400">
        <div class="flex items-center gap-2 mb-5">
          <div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <i class="fas fa-times text-red-500 text-sm"></i>
          </div>
          <span class="font-bold text-gray-700">導入前（今まで）</span>
        </div>
        <div class="space-y-3">
          ${beforeItem('各仕入先に毎回メールを手書き。書き方・宛先を都度確認')}
          ${beforeItem('Excelで管理しているが、誰が最新か分からなくなる')}
          ${beforeItem('「あの商品、発注したっけ？」と二重確認が発生')}
          ${beforeItem('仕入先によってメール・FAX・LINEがバラバラで管理が大変')}
          ${beforeItem('入荷状況を確認するたびに電話や別表を見る')}
          ${beforeItem('月末にまとめて確認すると発注漏れが発覚')}
        </div>
      </div>
      <!-- After -->
      <div class="bg-white rounded-2xl p-6 card-shadow border-l-4 border-green-500">
        <div class="flex items-center gap-2 mb-5">
          <div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
            <i class="fas fa-check text-green-600 text-sm"></i>
          </div>
          <span class="font-bold text-gray-700">導入後（GolfOrderで）</span>
        </div>
        <div class="space-y-3">
          ${afterItem('商品選択→数量入力→送信で完了。発注メールが自動生成')}
          ${afterItem('全発注が1画面に集約。ステータスが一目でわかる')}
          ${afterItem('「発注済み」「入荷待ち」をリアルタイムで確認できる')}
          ${afterItem('メール・FAX・LINEの違いをシステムが覚えて自動選択')}
          ${afterItem('入荷確認ボタン1つで完了。バックオーダーも自動管理')}
          ${afterItem('発注漏れ・未入荷リストを毎日自動で表示')}
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     機能紹介
═══════════════════════════════════════════════ -->
<section id="features" class="py-16 px-4 sm:px-6 bg-white">
  <div class="max-w-5xl mx-auto">
    <div class="text-center mb-12">
      <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-2">主な機能</h2>
      <p class="text-gray-500">ゴルフショップの発注業務に必要な機能だけを、<br class="hidden sm:block">シンプルにまとめました</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${featureCard('fas fa-magic', 'bg-blue-50 text-blue-600',
        '発注メール自動生成',
        '商品・数量を選ぶだけで、仕入先ごとの発注メールを自動作成。送信前に内容を確認・編集できます。')}
      ${featureCard('fas fa-route', 'bg-green-50 text-green-600',
        '仕入先自動振り分け',
        '商品カテゴリ・メーカーに応じて、どの仕入先に発注すべきかをシステムが自動で判定します。')}
      ${featureCard('fas fa-clipboard-list', 'bg-orange-50 text-orange-600',
        'ステータス一元管理',
        '下書き→発注済み→入荷待ち→入荷完了まで、全発注を1画面で追跡できます。')}
      ${featureCard('fas fa-box-open', 'bg-purple-50 text-purple-600',
        'バックオーダー追跡',
        '未入荷・入荷待ちの発注を自動でリスト化。お客様への返答も素早く対応できます。')}
      ${featureCard('fas fa-address-book', 'bg-pink-50 text-pink-600',
        '仕入先情報を一括管理',
        'メール・FAX・LINE・電話など発注方法を仕入先ごとに登録。連絡先を都度探す手間がなくなります。')}
      ${featureCard('fas fa-chart-bar', 'bg-teal-50 text-teal-600',
        '発注履歴・実績管理',
        '過去の発注履歴をいつでも確認。同じ商品の前回発注内容を参考にして素早く再発注できます。')}
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     モックアップ詳細：発注一覧画面
═══════════════════════════════════════════════ -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div class="inline-block bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          発注管理画面
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          全発注を1画面で。<br>ステータスが一目でわかる。
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          お客様名・商品・仕入先・発注日・ステータスをすべて一覧表示。
          フィルターで「発注済み」「入荷待ち」だけを絞り込みも簡単です。
        </p>
        <ul class="space-y-3">
          ${checkItem('下書きから始めて、準備ができたら一括送信')}
          ${checkItem('仕入先ごとに自動で発注書を分割')}
          ${checkItem('入荷後はワンクリックで完了処理')}
        </ul>
      </div>
      <div class="mockup-window bg-white text-gray-800 text-xs">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">/ 発注一覧</span>
        </div>
        <div class="p-3 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="font-bold text-sm text-gray-700">発注一覧</span>
            <div class="flex gap-1">
              <span class="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full">発注済み 3件</span>
              <span class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">未入荷 2件</span>
            </div>
          </div>
          <div class="bg-white rounded-lg overflow-hidden card-shadow">
            <table class="w-full text-xs">
              <thead>
                <tr class="bg-gray-100 text-gray-500">
                  <th class="text-left px-2 py-2">顧客名</th>
                  <th class="text-left px-2 py-2">仕入先</th>
                  <th class="text-left px-2 py-2">発注日</th>
                  <th class="text-left px-2 py-2">状態</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50">
                ${orderTableRow('鈴木 一郎 様', 'ワークスシャフト', '6/17', 'ordered')}
                ${orderTableRow('田中 花子 様', 'プレミアムシャフト', '6/15', 'ordered')}
                ${orderTableRow('佐藤 健 様', '山田グリップ', '6/10', 'received')}
                ${orderTableRow('（在庫補充）', 'スポーツアパレル', '6/19', 'ordered')}
                ${orderTableRow('（工房消耗品）', '工房備品センター', '6/20', 'draft')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     モックアップ詳細：メール自動生成
═══════════════════════════════════════════════ -->
<section class="py-16 px-4 sm:px-6 bg-white">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <!-- メールモックアップ -->
      <div class="mockup-window bg-white text-gray-800 text-xs order-2 lg:order-1">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">発注メール プレビュー</span>
        </div>
        <div class="p-4 space-y-3">
          <div class="bg-gray-50 rounded-lg p-3 space-y-1.5">
            <div class="flex gap-2">
              <span class="text-gray-400 w-10 shrink-0">宛先</span>
              <span class="text-blue-600">order@works-shaft.example.com</span>
            </div>
            <div class="flex gap-2">
              <span class="text-gray-400 w-10 shrink-0">件名</span>
              <span class="font-medium">【ゴルフウィング】発注のご依頼 2024-06-17</span>
            </div>
          </div>
          <div class="bg-white border border-gray-100 rounded-lg p-3 text-gray-700 space-y-2 leading-relaxed">
            <p>ワークスシャフト株式会社<br>小森 健太 様</p>
            <p>お世話になっております。<br>ゴルフウィングの古川でございます。</p>
            <p>下記の通りご発注をお願いいたします。</p>
            <div class="bg-gray-50 rounded p-2 text-xs font-mono space-y-0.5">
              <div class="flex justify-between"><span>WS-DR α 45S</span><span>× 1本</span></div>
              <div class="flex justify-between"><span>WS-IRON β 95S</span><span>× 2本</span></div>
              <div class="border-t border-gray-200 pt-1 flex justify-between font-bold">
                <span>合計</span><span>¥70,200（税込）</span>
              </div>
            </div>
            <p>お手数をおかけしますが、よろしくお願いいたします。</p>
          </div>
          <div class="flex gap-2 justify-end">
            <button class="bg-gray-100 text-gray-600 text-xs px-3 py-1.5 rounded-lg">編集</button>
            <button class="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg">
              <i class="fas fa-paper-plane mr-1"></i>送信
            </button>
          </div>
        </div>
      </div>
      <div class="order-1 lg:order-2">
        <div class="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          メール自動生成
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          発注メールは<br>自動で生成。<br>送るだけ。
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          商品・数量を入力するだけで、仕入先ごとの発注メールが自動作成されます。
          毎回ゼロから書く必要はありません。
        </p>
        <ul class="space-y-3">
          ${checkItem('仕入先ごとの挨拶文・署名を自動で挿入')}
          ${checkItem('送信前にプレビューして内容を確認')}
          ${checkItem('FAX・LINE発注もシステムで管理')}
        </ul>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     モックアップ詳細：仕入先振り分けルール
═══════════════════════════════════════════════ -->
<section class="py-16 px-4 sm:px-6 bg-gray-50">
  <div class="max-w-5xl mx-auto">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <div class="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
          自動振り分けルール
        </div>
        <h2 class="text-2xl sm:text-3xl font-black text-gray-800 mb-4">
          どの商品を<br>どこに発注するか、<br>システムが覚える。
        </h2>
        <p class="text-gray-500 leading-relaxed mb-6">
          「このシャフトはワークスへ、このグリップは山田グリップへ」という
          仕入ルールをシステムに登録しておけば、あとは自動で振り分けます。
        </p>
        <ul class="space-y-3">
          ${checkItem('カテゴリ・メーカー・クラブ種別でルール設定')}
          ${checkItem('例外ルールも優先度設定で柔軟に対応')}
          ${checkItem('担当者が変わっても発注ミスを防げる')}
        </ul>
      </div>
      <div class="mockup-window bg-white text-gray-800 text-xs">
        <div class="mockup-titlebar">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
          <span class="flex-1 text-center text-xs text-gray-400 font-mono">仕入先判定ルール</span>
        </div>
        <div class="p-3 bg-gray-50">
          <div class="text-sm font-bold text-gray-700 mb-3">仕入先自動振り分けルール</div>
          <div class="space-y-2">
            ${ruleRow('シャフト', 'ワークスシャフト', 'ワークスシャフト株式会社', 'メール')}
            ${ruleRow('シャフト', 'プレミアムシャフト', 'プレミアムシャフト工業', 'メール')}
            ${ruleRow('グリップ', '山田グリップ', '山田グリップ商事', 'LINE')}
            ${ruleRow('アパレル', '（全メーカー）', 'スポーツアパレルジャパン', 'メール')}
            ${ruleRow('工房用品', '（全メーカー）', '工房備品センター', 'FAX')}
          </div>
          <div class="mt-3 text-xs text-gray-400 text-center">
            <i class="fas fa-info-circle mr-1"></i>商品登録時に自動でこのルールが適用されます
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     CTA（デモ誘導）
═══════════════════════════════════════════════ -->
<section class="gradient-green py-16 px-4 text-white">
  <div class="max-w-2xl mx-auto text-center">
    <div class="text-3xl mb-4">⛳</div>
    <h2 class="text-2xl sm:text-3xl font-black mb-4">
      まずは無料デモで<br>体験してみてください
    </h2>
    <p class="text-green-100 leading-relaxed mb-8">
      実際の画面を操作できるデモ環境を用意しています。<br>
      登録不要・クレジットカード不要。今すぐ試せます。
    </p>
    <div class="flex flex-col sm:flex-row gap-4 justify-center">
      <a href="/demo-login"
         class="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-900 font-bold px-10 py-4 rounded-xl text-base shadow-lg transition">
        <i class="fas fa-play-circle text-xl"></i>
        デモを始める（無料）
      </a>
      <a href="/login"
         class="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-medium px-8 py-4 rounded-xl text-base border border-white/30 transition">
        <i class="fas fa-sign-in-alt mr-1"></i>
        ログイン
      </a>
    </div>
    <p class="text-green-200 text-sm mt-5">
      <i class="fas fa-lock mr-1"></i>デモモードは参照のみ。データの変更・登録はできません。
    </p>
  </div>
</section>

<!-- ═══════════════════════════════════════════════
     フッター
═══════════════════════════════════════════════ -->
<footer class="bg-gray-900 text-gray-400 py-8 px-4 text-center text-sm">
  <div class="flex items-center justify-center gap-2 mb-2">
    <div class="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
      <i class="fas fa-golf-ball-tee text-white text-xs"></i>
    </div>
    <span class="font-bold text-white">${appName}</span>
  </div>
  <p class="text-gray-500 text-xs">ゴルフショップ専用 発注管理システム</p>
</footer>

<script>
// スムーススクロール
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault()
    const el = document.querySelector(a.getAttribute('href'))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
})
</script>
</body>
</html>`
}

// ─── ヘルパー関数（HTML断片を返す） ─────────────────────────

function statusBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    draft:    ['bg-gray-100 text-gray-600',   '下書き'],
    ordered:  ['bg-orange-100 text-orange-700', '発注済'],
    received: ['bg-green-100 text-green-700',  '入荷済'],
  }
  const [cls, label] = map[status] ?? ['bg-gray-100 text-gray-500', status]
  return `<span class="${cls} text-xs px-1.5 py-0.5 rounded-full font-medium">${label}</span>`
}

function methodBadge(method: string): string {
  const map: Record<string, string> = {
    'メール': 'bg-blue-50 text-blue-600',
    'LINE':   'bg-green-50 text-green-600',
    'FAX':    'bg-purple-50 text-purple-600',
    '電話':   'bg-yellow-50 text-yellow-700',
  }
  return `<span class="${map[method] ?? 'bg-gray-100 text-gray-500'} text-xs px-1.5 py-0.5 rounded font-medium">${method}</span>`
}

function mockOrderRow(customer: string, product: string, supplier: string, status: string, date: string): string {
  return `
  <div class="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
    <div class="flex-1 min-w-0">
      <div class="font-medium text-gray-800 text-xs truncate">${customer}</div>
      <div class="text-gray-400 text-xs truncate">${product} / ${supplier}</div>
    </div>
    <div class="flex items-center gap-1.5 ml-2 shrink-0">
      <span class="text-gray-400 text-xs">${date}</span>
      ${statusBadge(status)}
    </div>
  </div>`
}

function orderTableRow(customer: string, supplier: string, date: string, status: string): string {
  return `
  <tr class="hover:bg-gray-50">
    <td class="px-2 py-2 text-gray-700">${customer}</td>
    <td class="px-2 py-2 text-gray-500">${supplier}</td>
    <td class="px-2 py-2 text-gray-400">${date}</td>
    <td class="px-2 py-2">${statusBadge(status)}</td>
  </tr>`
}

function ruleRow(category: string, maker: string, supplier: string, method: string): string {
  return `
  <div class="bg-white rounded-lg p-2.5 flex items-center gap-2 card-shadow">
    <div class="flex-1 min-w-0">
      <span class="text-gray-700 font-medium">${category}</span>
      <span class="text-gray-400 mx-1">›</span>
      <span class="text-gray-500 text-xs">${maker}</span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <span class="text-blue-700 text-xs font-medium">${supplier}</span>
      ${methodBadge(method)}
    </div>
  </div>`
}

function featureCard(icon: string, iconStyle: string, title: string, desc: string): string {
  return `
  <div class="bg-white rounded-2xl p-6 card-shadow hover:shadow-lg transition">
    <div class="feature-icon ${iconStyle} mb-4">
      <i class="${icon}"></i>
    </div>
    <h3 class="font-bold text-gray-800 mb-2">${title}</h3>
    <p class="text-gray-500 text-sm leading-relaxed">${desc}</p>
  </div>`
}

function beforeItem(text: string): string {
  return `
  <div class="flex items-start gap-2">
    <i class="fas fa-circle-xmark text-red-400 mt-0.5 shrink-0"></i>
    <span class="text-sm text-gray-600">${text}</span>
  </div>`
}

function afterItem(text: string): string {
  return `
  <div class="flex items-start gap-2">
    <i class="fas fa-circle-check text-green-500 mt-0.5 shrink-0"></i>
    <span class="text-sm text-gray-600">${text}</span>
  </div>`
}

function checkItem(text: string): string {
  return `
  <div class="flex items-start gap-3">
    <div class="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center shrink-0 mt-0.5">
      <i class="fas fa-check text-blue-600 text-xs"></i>
    </div>
    <span class="text-gray-600">${text}</span>
  </div>`
}
