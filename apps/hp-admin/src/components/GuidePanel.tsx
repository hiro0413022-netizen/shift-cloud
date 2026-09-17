export default function GuidePanel() {
  const box = "card p-4 space-y-2 text-[14px] leading-relaxed";
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-navy">使い方</h2>
      <div className={box}>
        <h3 className="font-bold">はじめに</h3>
        <p>
          上の丸いボタン（YOZAN／FRANK GOLF／KALLINOS）で、どのホームページを触るか選びます。保存した内容は
          <b>約1分</b>でホームページに反映されます（業者への依頼や再公開の作業はいりません）。
        </p>
        <p className="text-[12px] text-soft">スマホでも使えます。ホーム画面に追加しておくと便利です（Safari：共有ボタン →「ホーム画面に追加」）。</p>
      </div>
      <div className={box}>
        <h3 className="font-bold">📝 ブログ・お知らせを書く</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「ブログ」→「＋ 新しく書く」</li>
          <li>タイトルと本文を書く。ボタンで「見出し」「太字」「写真」「リンク」を入れられます</li>
          <li>右側（スマホは下）でアイキャッチ写真とカテゴリを選ぶ</li>
          <li>「見え方」で仕上がりを確認 →「公開する」</li>
        </ol>
        <p className="text-[12px] text-soft">
          途中でやめるときは「下書き保存」。公開日時に先の日付を入れると、その時間に自動で公開されます。公開中の記事を「下書き保存」するとホームページから外れます。
        </p>
      </div>
      <div className={box}>
        <h3 className="font-bold">📷 Instagram の投稿を出す</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>インスタアプリで出したい投稿を開き「…」（または紙飛行機）→「リンクをコピー」</li>
          <li>「インスタ」タブの「投稿のURL」に貼り付けて「＋ ホームページに追加」</li>
        </ol>
        <p className="text-[12px] text-soft">
          新しく追加した順にトップのInstagram欄へ並びます。出したくない投稿は「隠す」。インスタの投稿自体は何も変わりません。
        </p>
      </div>
      <div className={box}>
        <h3 className="font-bold">🖼️ 写真・文言を入れ替える</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「写真・文言」→ ページ（トップページ など）を選ぶ</li>
          <li>変えたい場所の「写真を変える」を押してスマホ・PCの写真を選ぶ（自動で軽くしてから保存します）</li>
          <li>文字は書き換えて「保存」</li>
        </ol>
        <p className="text-[12px] text-soft">
          「元に戻す」でいつでも最初の状態に戻せます。写真は横長（16:9くらい）で、人の顔が中央にあるものがきれいに収まります。
        </p>
      </div>
      <div className={box}>
        <h3 className="font-bold">📊 数字を見る</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li><b>閲覧数</b>：ページが見られた回数</li>
          <li><b>訪問者数</b>：見に来た人の数（同じ人が何回見ても1人）</li>
          <li><b>Google検索での表示回数（インプレッション）</b>：Googleの検索結果にサイトが出た回数</li>
          <li><b>検索からのクリック</b>：検索結果から実際にクリックされた回数</li>
          <li><b>どこから来たか</b>：Google検索・Instagram・LINE など</li>
        </ul>
        <p className="text-[12px] text-soft">
          インスタのプロフィールやLINEで配るURLの後ろに <code>?src=insta</code> のように付けると、「どこから来たか」にその名前で出ます。
        </p>
      </div>
      <div className={box}>
        <h3 className="font-bold">困ったとき</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>「ログインが切れました」と出たら、もう一度ログインしてください</li>
          <li>パスワードは「設定」から変えられます。忘れたら古川までご連絡ください</li>
          <li>保存したのに出ないときは、1〜2分待ってからホームページを再読み込みしてください</li>
        </ul>
      </div>
    </div>
  );
}
