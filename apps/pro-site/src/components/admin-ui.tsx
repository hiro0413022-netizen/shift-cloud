import Link from "next/link";

export function AdminTitle({ slug, title, hint }: { slug: string; title: string; hint?: string }) {
  return (
    <div className="mb-5">
      <Link href={`/${slug}/admin`} className="text-xs text-(--color-dim)">← 管理メニューへ</Link>
      <h1 className="mt-1 text-xl font-black">{title}</h1>
      {hint ? <p className="mt-1 text-xs text-(--color-dim)">{hint}</p> : null}
    </div>
  );
}

export function Msg({ ok, err }: { ok?: string; err?: string }) {
  if (ok) {
    return <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-bold text-(--color-ok)">保存しました。HPに反映されています。</p>;
  }
  if (err) {
    const map: Record<string, string> = {
      login: "パスワードが違います。",
      title: "タイトルを入力してください。",
      required: "必須項目（名前・日付など）を入力してください。",
      url: "InstagramのリンクURLではないようです。投稿の「リンクをコピー」で取得したURLを貼ってください。",
      label: "項目名を入力してください。",
      event: "競技名を入力してください。",
      short: "パスワードは8文字以上にしてください。",
      name: "スポンサー名を入力してください。",
      file: "バナー画像を選択してください。",
      filetype: "画像ファイル（PNG / JPG など）を選択してください。",
      filesize: "画像は5MB以下にしてください。スクリーンショットや縮小版でお試しください。",
      upload: "アップロードに失敗しました。少し時間をおいてもう一度お試しください。",
    };
    return <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-bold text-(--color-danger)">{map[err] ?? "エラーが発生しました。"}</p>;
  }
  return null;
}

export function DeleteButton({ label = "削除" }: { label?: string }) {
  return (
    <button type="submit" className="rounded-lg border border-(--color-danger) px-3 py-2 text-xs font-bold text-(--color-danger)">
      {label}
    </button>
  );
}
