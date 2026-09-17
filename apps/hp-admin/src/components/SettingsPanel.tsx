"use client";
import { useEffect, useState } from "react";
import { edge, getToken, rpc, type Me } from "@/lib/api";
import { fmtDate, type ToastApi } from "./ui";

type GscStatus = {
  connected: boolean;
  client_email: string | null;
  properties: Record<string, string | null>;
  last_sync: Record<string, string>;
};

export default function SettingsPanel({ me, toast, onError }: { me: Me; toast: ToastApi; onError: (e: unknown) => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-navy">設定</h2>
      <div className="card p-4 text-sm">
        <div className="text-[11px] text-soft">ログイン中</div>
        <div className="font-semibold">
          {me.name}（ID: {me.login_id}・{me.role === "owner" ? "オーナー" : "編集者"}）
        </div>
      </div>
      <PasswordForm toast={toast} onError={onError} />
      {me.role === "owner" && <GscSettings me={me} toast={toast} onError={onError} />}
    </div>
  );
}

function PasswordForm({ toast, onError }: { toast: ToastApi; onError: (e: unknown) => void }) {
  const [oldPw, setOld] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card max-w-md space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw !== pw2) return onError(new Error("新しいパスワードが2回とも同じになっていません"));
        setBusy(true);
        try {
          await rpc("hp_change_password", { p_token: getToken() ?? "", p_old: oldPw, p_new: pw });
          setOld("");
          setPw("");
          setPw2("");
          toast.ok("パスワードを変更しました");
        } catch (err) {
          onError(err);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-sm font-bold">パスワードを変える</h3>
      <div>
        <label className="label">今のパスワード</label>
        <input className="field" type="password" autoComplete="current-password" value={oldPw} onChange={(e) => setOld(e.target.value)} required />
      </div>
      <div>
        <label className="label">新しいパスワード（8文字以上）</label>
        <input className="field" type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
      </div>
      <div>
        <label className="label">新しいパスワード（もう一度）</label>
        <input className="field" type="password" autoComplete="new-password" minLength={8} value={pw2} onChange={(e) => setPw2(e.target.value)} required />
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? "変更中…" : "変更する"}
      </button>
    </form>
  );
}

function GscSettings({ me, toast, onError }: { me: Me; toast: ToastApi; onError: (e: unknown) => void }) {
  const [st, setSt] = useState<GscStatus | null>(null);
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [props, setProps] = useState<{ siteUrl: string; permissionLevel: string }[] | null>(null);

  const load = () => edge<GscStatus>("gsc_status").then(setSt).catch(onError);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProps = async () => {
    try {
      const r = await edge<{ sites: { siteUrl: string; permissionLevel: string }[] }>("gsc_list_properties");
      setProps(r.sites);
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div className="card space-y-4 p-4">
      <div>
        <h3 className="text-sm font-bold">Google Search Console 連携（オーナーのみ）</h3>
        <p className="text-[12px] text-soft">つなぐと「数字」タブに Google 検索での表示回数・クリック・キーワードが出ます。</p>
      </div>
      {!st ? (
        <p className="text-sm text-soft">確認中…</p>
      ) : !st.connected ? (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">
            <li>Google Cloud でサービスアカウントを作り、「Google Search Console API」を有効にする</li>
            <li>サービスアカウントの「鍵」→「鍵を追加」→ JSON をダウンロード</li>
            <li>ダウンロードしたファイルをメモ帳で開き、中身を全部下に貼り付けて「連携する」</li>
            <li>表示されたメールアドレスを、Search Console の「設定 → ユーザーと権限」に「制限付き」で追加</li>
          </ol>
          <textarea
            className="field min-h-32 font-mono text-xs"
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"type": "service_account", "client_email": "...", "private_key": "-----BEGIN PRIVATE KEY-----..." }'
          />
          <button
            className="btn-primary"
            disabled={busy || !json.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await edge<{ client_email: string }>("gsc_connect", { service_account: json });
                setJson("");
                toast.ok(`連携しました：${r.client_email}`);
                await load();
              } catch (e) {
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "確認中…" : "連携する"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg bg-bg p-3 text-[13px]">
            連携中のサービスアカウント：
            <div className="mt-1 select-all break-all font-mono text-xs">{st.client_email}</div>
            <div className="mt-1 text-[11px] text-soft">このアドレスを各サイトの Search Console に「ユーザー」として追加してください。</div>
          </div>
          <button className="btn-ghost text-xs" onClick={loadProps}>
            見えているプロパティを確認
          </button>
          {props && (
            <div className="text-[12px] text-soft">
              {props.length === 0 ? "まだ1つも見えていません（Search Console でユーザー追加が必要です）" : props.map((p) => <div key={p.siteUrl}>{p.siteUrl}（{p.permissionLevel}）</div>)}
            </div>
          )}
          <div className="space-y-2">
            {me.sites.map((s) => (
              <PropRow key={s.code} code={s.code} name={s.name} domain={s.domain} value={st.properties[s.code] ?? ""} last={st.last_sync[s.code]} options={props} toast={toast} onError={onError} onSaved={load} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PropRow({
  code,
  name,
  domain,
  value,
  last,
  options,
  toast,
  onError,
  onSaved,
}: {
  code: string;
  name: string;
  domain: string;
  value: string;
  last?: string;
  options: { siteUrl: string }[] | null;
  toast: ToastApi;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const listId = `props-${code}`;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="mb-1 text-[13px] font-semibold">{name}</div>
      <div className="flex flex-wrap gap-2">
        <input
          className="field min-w-0 flex-1 text-xs"
          list={listId}
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder={`sc-domain:${domain} または https://${domain}/`}
        />
        <datalist id={listId}>
          {(options ?? []).map((o) => (
            <option key={o.siteUrl} value={o.siteUrl} />
          ))}
        </datalist>
        <button
          className="btn-ghost text-xs"
          onClick={async () => {
            try {
              await edge("gsc_set_property", { site: code, property: v });
              if (v) await edge("gsc_sync", { site: code, force: true, days: 480 });
              toast.ok(v ? "保存して取り込みました" : "保存しました");
              onSaved();
            } catch (e) {
              onError(e);
            }
          }}
        >
          保存して取り込む
        </button>
      </div>
      {last && <div className="mt-1 text-[11px] text-soft">最終取り込み {fmtDate(last)}</div>}
    </div>
  );
}
