"use client";
import { useCallback, useEffect, useState } from "react";
import { AuthError, arpc, getToken, rpc, setToken, type Me } from "@/lib/api";
import { Spinner, useToast } from "./ui";
import Dashboard from "./Dashboard";
import SlotsPanel from "./SlotsPanel";
import BlogPanel from "./BlogPanel";
import InstagramPanel from "./InstagramPanel";
import SettingsPanel from "./SettingsPanel";
import GuidePanel from "./GuidePanel";

const TABS = [
  { id: "dashboard", label: "数字", icon: "📊" },
  { id: "blog", label: "ブログ", icon: "📝" },
  { id: "instagram", label: "インスタ", icon: "📷" },
  { id: "slots", label: "写真・文言", icon: "🖼️" },
  { id: "guide", label: "使い方", icon: "❓" },
  { id: "settings", label: "設定", icon: "⚙️" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdminApp() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [site, setSite] = useState<string>("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const toast = useToast();

  const toastErr = toast.err;
  const onAuthError = useCallback(
    (e: unknown) => {
      if (e instanceof AuthError) {
        setToken(null);
        setMe(null);
      }
      toastErr(e);
    },
    [toastErr],
  );

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const qs = q.get("tab") as Tab | null;
    if (qs && TABS.some((t) => t.id === qs)) setTab(qs);
    if (!getToken()) {
      setBooting(false);
      return;
    }
    arpc<Me>("hp_admin_me")
      .then((m) => {
        setMe(m);
        const saved = q.get("site") ?? safeGet("hp_admin_site");
        setSite(m.sites.some((s) => s.code === saved) ? (saved as string) : m.sites[0]?.code ?? "");
      })
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!site) return;
    safeSet("hp_admin_site", site);
    const u = new URL(location.href);
    u.searchParams.set("site", site);
    u.searchParams.set("tab", tab);
    history.replaceState(null, "", u.toString());
  }, [site, tab]);

  if (booting) return <Spinner />;
  if (!me)
    return (
      <>
        <Login
          onLogin={(m) => {
            setMe(m);
            setSite(m.sites[0]?.code ?? "");
          }}
          onError={toast.err}
        />
        {toast.node}
      </>
    );

  const current = me.sites.find((s) => s.code === site) ?? me.sites[0];

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 bg-navy text-white shadow">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="text-[15px] font-bold tracking-wide">
            HP管理 <span className="text-[11px] font-normal text-white/60">YOZAN GROUP</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="hidden text-white/70 sm:inline">{me.name} さん</span>
            <button
              className="rounded-md border border-white/25 px-2.5 py-1 hover:bg-white/10"
              onClick={async () => {
                await rpc("hp_logout", { p_token: getToken() ?? "" }).catch(() => {});
                setToken(null);
                setMe(null);
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {me.sites.map((s) => (
            <button
              key={s.code}
              onClick={() => setSite(s.code)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                s.code === current?.code ? "bg-white text-navy" : "bg-white/10 text-white/85 hover:bg-white/20"
              }`}
            >
              {shortName(s.name)}
            </button>
          ))}
        </div>
      </header>

      <nav className="sticky top-[92px] z-20 hidden border-b border-line bg-white md:block">
        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-3 text-sm font-semibold ${
                tab === t.id ? "border-gold text-navy" : "border-transparent text-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
          {current && (
            <a
              href={`https://${current.domain}`}
              target="_blank"
              rel="noopener"
              className="ml-auto self-center text-xs font-semibold text-navy-2 hover:underline"
            >
              {current.domain} を開く ↗
            </a>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {current && !current.live && tab !== "settings" && tab !== "guide" && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
            <b>{shortName(current.name)}</b> のホームページは、まだこの管理画面とつながっていません（準備中）。
            ここで入れた内容は保存され、つながった時点でサイトに出ます。
          </div>
        )}
        {current && tab === "dashboard" && <Dashboard key={current.code} site={current} onError={onAuthError} />}
        {current && tab === "slots" && <SlotsPanel key={current.code} site={current} toast={toast} onError={onAuthError} />}
        {current && tab === "blog" && <BlogPanel key={current.code} site={current} toast={toast} onError={onAuthError} />}
        {current && tab === "instagram" && (
          <InstagramPanel key={current.code} site={current} toast={toast} onError={onAuthError} />
        )}
        {tab === "guide" && <GuidePanel />}
        {tab === "settings" && <SettingsPanel me={me} toast={toast} onError={onAuthError} />}
      </main>

      {/* スマホ下タブ */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              window.scrollTo({ top: 0 });
            }}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
              tab === t.id ? "text-navy" : "text-soft"
            }`}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {toast.node}
    </div>
  );
}

function shortName(n: string) {
  return n.replace("株式会社YOZAN（コーポレート）", "YOZAN").replace(" 姫路", "");
}
function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* noop */
  }
}

function Login({ onLogin, onError }: { onLogin: (m: Me) => void; onError: (e: unknown) => void }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy px-4">
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await rpc<{ token: string }>("hp_login", { p_login: id, p_password: pw });
            setToken(r.token);
            onLogin(await arpc<Me>("hp_admin_me"));
          } catch (err) {
            onError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-1 text-xs font-bold tracking-[.2em] text-gold">YOZAN GROUP</div>
        <h1 className="mb-6 text-xl font-bold text-navy">ホームページ管理</h1>
        <label className="label">ログインID</label>
        <input
          className="field mb-4"
          value={id}
          onChange={(e) => setId(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          required
        />
        <label className="label">パスワード</label>
        <input
          className="field mb-6"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          required
        />
        <button className="btn-primary w-full py-3" disabled={busy}>
          {busy ? "確認中…" : "ログイン"}
        </button>
        <p className="mt-4 text-center text-[11px] text-soft">ログインは30日間このブラウザに保存されます</p>
      </form>
    </div>
  );
}
