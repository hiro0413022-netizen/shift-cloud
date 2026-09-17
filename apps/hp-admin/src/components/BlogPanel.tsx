"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { arpc, uploadImage, type Post, type SiteData, type SiteInfo } from "@/lib/api";
import { renderBody } from "@/lib/body";
import ImagePicker from "./ImagePicker";
import { Empty, Spinner, fmtDate, type ToastApi } from "./ui";

const CATEGORIES = ["お知らせ", "ブログ", "イベント", "キャンペーン", "メディア掲載", "採用"];

const blank = (): Post => ({
  slug: "",
  title: "",
  excerpt: "",
  body: "",
  cover_url: null,
  category: "ブログ",
  status: "draft",
  published_at: null,
  author_name: null,
});

export default function BlogPanel({ site, toast, onError }: { site: SiteInfo; toast: ToastApi; onError: (e: unknown) => void }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const load = useCallback(() => arpc<SiteData>("hp_admin_site", { p_site: site.code }).then(setData).catch(onError), [site.code, onError]);
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return <Spinner />;
  if (editing)
    return (
      <Editor
        site={site}
        post={editing}
        media={data.media}
        toast={toast}
        onError={onError}
        onClose={async (changed) => {
          setEditing(null);
          if (changed) await load();
          window.scrollTo({ top: 0 });
        }}
      />
    );

  return (
    <div>
      <div className="mb-4 flex items-end gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-bold text-navy">ブログ・お知らせ</h2>
          <p className="text-[13px] text-soft">「公開」にした記事がホームページのブログ欄とトップに並びます。</p>
        </div>
        <button className="btn-gold" onClick={() => setEditing(blank())}>
          ＋ 新しく書く
        </button>
      </div>
      {data.posts.length === 0 ? (
        <Empty>まだ記事がありません。「＋ 新しく書く」から1本目を書いてみましょう。</Empty>
      ) : (
        <ul className="space-y-2">
          {data.posts.map((p) => (
            <li key={p.id}>
              <button className="card flex w-full items-center gap-3 p-3 text-left hover:border-navy-2" onClick={() => setEditing(p)}>
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.cover_url && <img src={p.cover_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge p={p} />
                    <span className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-soft">{p.category}</span>
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold">{p.title}</div>
                  <div className="text-[11px] text-soft">
                    {p.status === "published" ? `公開日 ${fmtDate(p.published_at, false)}` : "下書き"}・更新 {p.updated_by ?? ""} {fmtDate(p.updated_at)}
                  </div>
                </div>
                <span className="text-soft">›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ p }: { p: Post }) {
  if (p.status !== "published") return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600">下書き</span>;
  if (p.published_at && new Date(p.published_at) > new Date())
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">予約公開</span>;
  return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">公開中</span>;
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Editor({
  site,
  post,
  media,
  toast,
  onError,
  onClose,
}: {
  site: SiteInfo;
  post: Post;
  media: { url: string }[];
  toast: ToastApi;
  onError: (e: unknown) => void;
  onClose: (changed: boolean) => void;
}) {
  const [p, setP] = useState<Post>({ ...post, excerpt: post.excerpt ?? "" });
  const [pubAt, setPubAt] = useState(toLocalInput(post.published_at));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Post>(k: K, v: Post[K]) => setP((x) => ({ ...x, [k]: v }));

  const insert = (before: string, after = "", placeholder = "") => {
    const ta = body.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    set("body", next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const lineStart = (prefix: string, placeholder: string) => {
    const ta = body.current;
    if (!ta) return;
    const { selectionStart: s, value } = ta;
    const ls = value.lastIndexOf("\n", s - 1) + 1;
    const needsBreak = ls === s ? "" : "\n";
    insert(`${needsBreak}${prefix}`, "", placeholder);
  };

  const submit = async (status: "draft" | "published") => {
    setBusy(true);
    try {
      await arpc("hp_admin_save_post", {
        p_site: site.code,
        p_post: { ...p, status, published_at: pubAt ? new Date(pubAt).toISOString() : status === "published" ? null : p.published_at },
      });
      toast.ok(status === "published" ? "公開しました。1分ほどでホームページに出ます" : "下書きに保存しました");
      onClose(true);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className="btn-ghost px-3" onClick={() => onClose(false)}>
          ‹ 一覧へ
        </button>
        <h2 className="text-lg font-bold text-navy">{post.id ? "記事を直す" : "新しい記事"}</h2>
        {post.id && post.status === "published" && (
          <a className="ml-auto text-xs font-semibold text-navy-2 underline" href={`https://${site.domain}/blog/${post.slug}`} target="_blank" rel="noopener">
            ホームページで見る ↗
          </a>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <div>
              <label className="label">タイトル（必須）</label>
              <input className="field text-base font-semibold" value={p.title} onChange={(e) => set("title", e.target.value)} placeholder="例：FRANK GOLF 姫路がオープンしました" />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="label mb-0">本文</label>
                <div className="ml-auto flex rounded-lg border border-line text-xs">
                  <button className={`px-3 py-1 ${!preview ? "bg-navy text-white" : ""} rounded-l-lg`} onClick={() => setPreview(false)}>
                    書く
                  </button>
                  <button className={`px-3 py-1 ${preview ? "bg-navy text-white" : ""} rounded-r-lg`} onClick={() => setPreview(true)}>
                    見え方
                  </button>
                </div>
              </div>
              {!preview ? (
                <>
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    <Tool onClick={() => lineStart("## ", "見出し")}>見出し</Tool>
                    <Tool onClick={() => lineStart("### ", "小見出し")}>小見出し</Tool>
                    <Tool onClick={() => insert("**", "**", "太字にする文字")}>
                      <b>太字</b>
                    </Tool>
                    <Tool onClick={() => lineStart("- ", "箇条書き")}>・箇条書き</Tool>
                    <Tool
                      onClick={() => {
                        const url = prompt("リンク先のURLを入れてください（https://〜）");
                        if (url) insert("[", `](${url.trim()})`, "リンクの文字");
                      }}
                    >
                      🔗 リンク
                    </Tool>
                    <Tool onClick={() => file.current?.click()}>{imgBusy ? "アップロード中…" : "🖼️ 写真を入れる"}</Tool>
                    <input
                      ref={file}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        setImgBusy(true);
                        try {
                          const url = await uploadImage(site.code, f, 1600);
                          const cap = prompt("写真の説明（空欄でもOK）") ?? "";
                          lineStart(`![${cap.replace(/[\[\]]/g, "")}](${url})\n`, "");
                        } catch (err) {
                          onError(err);
                        } finally {
                          setImgBusy(false);
                        }
                      }}
                    />
                  </div>
                  <textarea
                    ref={body}
                    className="field min-h-[360px] font-[inherit] leading-relaxed"
                    value={p.body}
                    onChange={(e) => set("body", e.target.value)}
                    placeholder={"ここに本文を書きます。\n\n空行をあけると段落が分かれます。\nボタンで見出しや写真を入れられます。"}
                  />
                </>
              ) : (
                <div className="post-body min-h-[360px] rounded-lg border border-line bg-white p-4">
                  {p.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.cover_url} alt="" className="mb-4 aspect-[16/9] w-full object-cover" />
                  )}
                  <h1 className="mb-4 text-2xl font-bold">{p.title || "（タイトル未入力）"}</h1>
                  <div dangerouslySetInnerHTML={{ __html: renderBody(p.body) }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-3 p-4">
            <div className="flex gap-2">
              <button className="btn-gold flex-1 py-2.5" disabled={busy} onClick={() => submit("published")}>
                {busy ? "保存中…" : p.status === "published" && post.id ? "更新して公開" : "公開する"}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => submit("draft")}>
                下書き保存
              </button>
            </div>
            {post.status === "published" && <p className="text-[11px] text-soft">「下書き保存」を押すとホームページから外れます。</p>}
            <div>
              <label className="label">公開日時（空欄＝今すぐ・先の日時＝予約公開）</label>
              <input type="datetime-local" className="field" value={pubAt} onChange={(e) => setPubAt(e.target.value)} />
            </div>
          </div>

          <div className="card space-y-3 p-4">
            <div>
              <label className="label">アイキャッチ写真（一覧とSNSで出る写真）</label>
              <div className="mb-2 aspect-[16/9] overflow-hidden rounded-lg bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.cover_url && <img src={p.cover_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ImagePicker site={site.code} media={media} onPicked={(u) => set("cover_url", u)} onError={onError} label="写真を選ぶ" compact />
                {p.cover_url && (
                  <button className="text-xs text-soft underline" onClick={() => set("cover_url", null)}>
                    外す
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="label">カテゴリ</label>
              <select className="field" value={p.category} onChange={(e) => set("category", e.target.value)}>
                {Array.from(new Set([...CATEGORIES, p.category])).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ひとこと紹介（一覧・Google検索に出る文。空欄なら本文の頭）</label>
              <textarea className="field min-h-20" maxLength={160} value={p.excerpt ?? ""} onChange={(e) => set("excerpt", e.target.value)} />
            </div>
            <div>
              <label className="label">URLの末尾（英数字とハイフン・空欄なら自動）</label>
              <div className="flex items-center gap-1 text-xs text-soft">
                <span className="shrink-0">/blog/</span>
                <input className="field" value={p.slug} onChange={(e) => set("slug", e.target.value)} placeholder="例：grand-open" />
              </div>
            </div>
            <div>
              <label className="label">書いた人の表示名（空欄ならあなたの名前）</label>
              <input className="field" value={p.author_name ?? ""} onChange={(e) => set("author_name", e.target.value)} />
            </div>
          </div>

          {post.id && (
            <button
              className="btn-danger w-full"
              disabled={busy}
              onClick={async () => {
                if (!confirm("この記事を削除しますか？（ホームページからも消えます）")) return;
                try {
                  await arpc("hp_admin_delete_post", { p_site: site.code, p_id: post.id });
                  toast.ok("削除しました");
                  onClose(true);
                } catch (e) {
                  onError(e);
                }
              }}
            >
              この記事を削除
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Tool({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-md border border-line bg-white px-2.5 py-1 text-xs hover:bg-bg">
      {children}
    </button>
  );
}
