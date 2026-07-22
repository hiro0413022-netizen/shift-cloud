"use client";

import { useActionState, useRef, useState } from "react";
import { submitReception, type ReceptionState } from "./actions";
import {
  VISIT_TYPES, OCCUPATIONS, CONTACT_METHODS, REFERRAL_SOURCES,
  TRIAL_REASONS, FITTING_REASONS, SCHOOL_GOALS, JOIN_INTEREST,
} from "@/lib/walkin";

const field =
  "w-full rounded-xl border border-(--color-line) bg-white px-4 py-3 text-base text-(--color-txt) placeholder:text-(--color-dim)/60 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15";
const labelCls = "mb-1 block text-sm font-medium text-(--color-dim)";
const cardCls = "rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 shadow-sm";

function CheckGroup({ name, options }: { name: string; options: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2.5 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5">
          <input type="checkbox" name={name} value={o} className="h-5 w-5 accent-(--color-accent)" />
          {o}
        </label>
      ))}
    </div>
  );
}

export function ReceptionForm({ token, storeName }: { token: string; storeName: string | null }) {
  const [state, action, pending] = useActionState<ReceptionState, FormData>(submitReception, {});
  const [visitType, setVisitType] = useState("trial");
  const [postal, setPostal] = useState("");
  const [address, setAddress] = useState("");
  const [addrLoading, setAddrLoading] = useState(false);
  const [confirm, setConfirm] = useState<Record<string, string> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // 郵便番号 → 住所 自動入力（zipcloud・キー不要の公開API）
  async function lookupPostal(zip: string) {
    const digits = zip.replace(/[^\d]/g, "");
    if (digits.length !== 7) return;
    setAddrLoading(true);
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`);
      const json = await res.json();
      const r = json?.results?.[0];
      if (r) setAddress(`${r.address1}${r.address2}${r.address3}`);
    } catch {
      /* オフライン等は手入力にフォールバック */
    } finally {
      setAddrLoading(false);
    }
  }

  function openConfirm() {
    setLocalError(null);
    const el = formRef.current;
    if (!el) return;
    const fd = new FormData(el);
    const familyName = String(fd.get("family_name") ?? "").trim();
    const givenName = String(fd.get("given_name") ?? "").trim();
    const phone = String(fd.get("phone") ?? "").trim();
    if (!familyName || !givenName) return setLocalError("お名前（姓・名）を入力してください");
    if (!phone) return setLocalError("電話番号を入力してください");
    if (fd.get("consent") !== "1") return setLocalError("個人情報の取扱いへの同意が必要です");

    const vt = VISIT_TYPES.find((v) => v.value === fd.get("visit_type"));
    setConfirm({
      利用区分: vt?.label ?? "",
      お名前: `${familyName} ${givenName}`,
      フリガナ: String(fd.get("name_kana") ?? ""),
      生年月日: String(fd.get("birth_date") ?? ""),
      電話番号: phone,
      メール: String(fd.get("email") ?? ""),
      郵便番号: String(fd.get("postal_code") ?? ""),
      ご住所: String(fd.get("address") ?? ""),
      ご職業: String(fd.get("occupation") ?? ""),
      連絡方法: String(fd.get("contact_method") ?? ""),
    });
  }

  // 受付完了
  if (state.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-3xl text-emerald-600">✓</div>
        <p className="mt-3 text-lg font-semibold">ご記入ありがとうございました</p>
        <p className="mt-2 text-sm text-(--color-dim)">受付が完了しました。タブレットをスタッフにお渡しください。</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          最初の画面に戻る（次の方へ）
        </button>
      </div>
    );
  }

  return (
    <>
      <form ref={formRef} action={action} className="space-y-4 pb-10">
        <input type="hidden" name="token" value={token} />

        {storeName && (
          <div className="rounded-xl border border-(--color-line) bg-white p-3 text-center text-sm font-medium text-(--color-dim) shadow-sm">
            {storeName}
          </div>
        )}

        {/* 利用区分 */}
        <div className={`${cardCls} space-y-3`}>
          <p className="text-sm font-semibold text-(--color-txt)">本日のご利用 <span className="text-rose-500">*</span></p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {VISIT_TYPES.map((v) => (
              <label
                key={v.value}
                className={`flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3.5 text-sm font-medium transition-colors ${
                  visitType === v.value
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-(--color-line) bg-white text-(--color-dim)"
                }`}
              >
                <input
                  type="radio" name="visit_type" value={v.value} className="sr-only"
                  checked={visitType === v.value} onChange={() => setVisitType(v.value)}
                />
                {v.label}
              </label>
            ))}
          </div>
        </div>

        {/* お客様情報 */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-sm font-semibold text-(--color-txt)">お客様情報</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>姓 <span className="text-rose-500">*</span></label>
              <input name="family_name" required placeholder="山田" className={field} />
            </div>
            <div>
              <label className={labelCls}>名 <span className="text-rose-500">*</span></label>
              <input name="given_name" required placeholder="太郎" className={field} />
            </div>
          </div>
          <div>
            <label className={labelCls}>フリガナ</label>
            <input name="name_kana" placeholder="ヤマダ タロウ" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>生年月日</label>
              <input type="date" name="birth_date" className={field} />
            </div>
            <div>
              <label className={labelCls}>性別</label>
              <select name="gender" defaultValue="" className={field}>
                <option value="">選択</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">その他</option>
                <option value="unknown">無回答</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>電話番号 <span className="text-rose-500">*</span></label>
              <input name="phone" type="tel" inputMode="tel" required placeholder="090-1234-5678" className={field} />
            </div>
            <div>
              <label className={labelCls}>メールアドレス</label>
              <input name="email" type="email" placeholder="example@mail.com" className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>郵便番号</label>
              <input
                name="postal_code"
                inputMode="numeric"
                placeholder="665-0000"
                className={field}
                value={postal}
                onChange={(e) => {
                  setPostal(e.target.value);
                  lookupPostal(e.target.value);
                }}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>ご住所{addrLoading && <span className="ml-2 text-xs text-accent">住所を検索中…</span>}</label>
              <input
                name="address"
                placeholder="兵庫県宝塚市〇〇町1-2-3"
                className={field}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ご職業</label>
              <select name="occupation" defaultValue="" className={field}>
                <option value="">選択</option>
                {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>ご希望の連絡方法</label>
              <select name="contact_method" defaultValue="" className={field}>
                <option value="">選択</option>
                {CONTACT_METHODS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* アンケート */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-sm font-semibold text-(--color-txt)">アンケート（任意）</p>
          <div>
            <label className={labelCls}>当店を何で知りましたか</label>
            <select name="referral_source" defaultValue="" className={field}>
              <option value="">選択</option>
              {REFERRAL_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>（紹介・その他の場合）詳細</label>
            <input name="referral_source_other" placeholder="紹介者名など" className={field} />
          </div>

          {visitType === "fitting" ? (
            <div>
              <label className={labelCls}>フィッティングでご興味のある点</label>
              <CheckGroup name="fitting_reasons" options={FITTING_REASONS} />
            </div>
          ) : (
            <div>
              <label className={labelCls}>ご利用の目的・ご興味</label>
              <CheckGroup name="trial_reasons" options={TRIAL_REASONS} />
            </div>
          )}

          <div>
            <label className={labelCls}>ゴルフスクールに通う目的</label>
            <CheckGroup name="school_goals" options={SCHOOL_GOALS} />
          </div>
          <div>
            <label className={labelCls}>入会へのご興味</label>
            <select name="join_interest" defaultValue="" className={field}>
              <option value="">選択</option>
              {JOIN_INTEREST.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ご要望・ご質問</label>
            <input name="comment" placeholder="自由記述" className={field} />
          </div>
        </div>

        {/* 同意 */}
        <div className={`${cardCls} space-y-3`}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
            <span>個人情報をサービス提供・入会手続きの目的で利用することに同意します。<span className="text-rose-500">*</span></span>
          </label>
        </div>

        {(localError || state.error) && (
          <p className="text-center text-sm text-rose-600">{localError ?? state.error}</p>
        )}

        {/* 確認画面へ（送信は確認後） */}
        <button
          type="button"
          onClick={openConfirm}
          className="w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
        >
          入力内容を確認する
        </button>
      </form>

      {/* 確認画面（オーバーレイ・フォームはマウントしたまま） */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-lg font-semibold text-(--color-txt)">この内容で受付しますか？</p>
            <dl className="mt-4 divide-y divide-(--color-line)">
              {Object.entries(confirm).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-2 text-sm">
                  <dt className="shrink-0 text-(--color-dim)">{k}</dt>
                  <dd className="text-right font-medium text-(--color-txt)">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-xl border border-(--color-line) bg-white py-3.5 text-base font-semibold text-(--color-dim) transition-colors hover:bg-(--color-panel-2)"
              >
                修正する
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirm(null);
                  formRef.current?.requestSubmit();
                }}
                className="rounded-xl bg-accent py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {pending ? "送信中..." : "この内容で受付する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
