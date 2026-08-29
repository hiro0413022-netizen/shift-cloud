"use client";

import { useActionState, useRef, useState } from "react";
import { submitReception, type ReceptionState } from "./actions";
import {
  VISIT_TYPES, OCCUPATIONS, CONTACT_METHODS, REFERRAL_SOURCES,
  TRIAL_REASONS, FITTING_REASONS, SCHOOL_GOALS, JOIN_INTEREST,
} from "@/lib/walkin";
import { AddressFields } from "@/components/address-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import { NameFields } from "@/components/name-fields";
import { joinName } from "@/lib/name";

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

export type ReceptionDefaults = {
  name?: string | null;
  name_kana?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  postal_code?: string | null;
  prefecture?: string | null;
  address1?: string | null;
  building?: string | null;
  occupation?: string | null;
  contact_method?: string | null;
  visit_type?: string | null;
};

/**
 * 店頭タブレットの受付フォーム。
 *
 * 2つの入り方がある（DECISIONS #186）:
 *   ① /reception/[token]        … 予約なしのご来店。全部お客様に書いていただく（従来）
 *   ② /reception/v/[intakeToken] … フィッティング予約からのご来店。
 *      予約フォームでいただいた氏名・カナ・電話・メールは **入力済みで開く**。
 *      同じことを二度書かせない（ユーザー指示 2026-08-29）。
 */
export function ReceptionForm({
  token,
  storeName,
  visitToken,
  defaults,
  reserve,
}: {
  token: string | null;
  storeName: string | null;
  visitToken?: string;
  defaults?: ReceptionDefaults;
  /** 予約でいただいた内容の読み上げ（スタッフとお客様が確認するだけ・入力欄ではない） */
  reserve?: { label: string; value: string }[];
}) {
  const [state, action, pending] = useActionState<ReceptionState, FormData>(submitReception, {});
  const [visitType, setVisitType] = useState(defaults?.visit_type ?? "trial");
  const [confirm, setConfirm] = useState<Record<string, string> | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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
      お名前: joinName(familyName, givenName),
      フリガナ: joinName(String(fd.get("family_name_kana") ?? ""), String(fd.get("given_name_kana") ?? "")),
      生年月日: String(fd.get("birth_date") ?? ""),
      電話番号: phone,
      メール: String(fd.get("email") ?? ""),
      郵便番号: String(fd.get("postal_code") ?? ""),
      ご住所: [fd.get("prefecture"), fd.get("address1"), fd.get("building")]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(" "),
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
        {/* 予約由来の受付URLは1回きり。読み込み直すと「使用済み」になるので戻るボタンは出さない */}
        {!visitToken && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-accent/90"
          >
            最初の画面に戻る（次の方へ）
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <form ref={formRef} action={action} className="space-y-4 pb-10">
        {token && <input type="hidden" name="token" value={token} />}
        {visitToken && <input type="hidden" name="visit_token" value={visitToken} />}

        {/* 予約でいただいた内容（お客様は書き直さない・確認だけ） */}
        {reserve && reserve.length > 0 && (
          <div className="rounded-2xl border border-(--color-line) bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-(--color-txt)">ご予約時にいただいた内容</p>
            <p className="mt-0.5 text-xs text-(--color-dim)">こちらは入力済みです。変更があればスタッフにお申しつけください。</p>
            <dl className="mt-3 divide-y divide-(--color-line)">
              {reserve.map((r) => (
                <div key={r.label} className="flex justify-between gap-3 py-2 text-sm">
                  <dt className="shrink-0 text-(--color-dim)">{r.label}</dt>
                  <dd className="text-right font-medium text-(--color-txt)">{r.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {storeName && (
          <div className="rounded-xl border border-(--color-line) bg-white p-3 text-center text-sm font-medium text-(--color-dim) shadow-sm">
            {storeName}
          </div>
        )}

        {/* 利用区分（予約由来のときは選ばせない。何で来られたかは確定している） */}
        <div className={`${cardCls} space-y-3`}>
          <p className="text-sm font-semibold text-(--color-txt)">本日のご利用 <span className="text-rose-500">*</span></p>
          {visitToken ? (
            <>
              <input type="hidden" name="visit_type" value={visitType} />
              <p className="rounded-xl border border-accent bg-accent/10 px-4 py-3 text-center text-sm font-medium text-accent">
                {VISIT_TYPES.find((v) => v.value === visitType)?.label ?? ""}
              </p>
            </>
          ) : (
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
          )}
        </div>

        {/* お客様情報 */}
        <div className={`${cardCls} space-y-4`}>
          <p className="text-sm font-semibold text-(--color-txt)">お客様情報</p>
          <div className="grid grid-cols-2 gap-3">
            <NameFields
              inputClassName={field}
              labelClassName={labelCls}
              defaults={{ name: defaults?.name, name_kana: defaults?.name_kana }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BirthDateInput
              inputClassName={field}
              labelClassName={labelCls}
              className="col-span-2"
              defaultValue={defaults?.birth_date ?? null}
            />
            <div className="col-span-2">
              <label className={labelCls}>性別</label>
              <select name="gender" defaultValue={defaults?.gender ?? ""} className={field}>
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
              <input name="phone" type="tel" inputMode="tel" required defaultValue={defaults?.phone ?? ""} placeholder="090-1234-5678" className={field} />
            </div>
            <div>
              <label className={labelCls}>メールアドレス</label>
              <input name="email" type="email" defaultValue={defaults?.email ?? ""} placeholder="example@mail.com" className={field} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <AddressFields
              inputClassName={field}
              labelClassName={labelCls}
              wideClassName="col-span-2"
              defaults={{
                postal_code: defaults?.postal_code ?? "",
                prefecture: defaults?.prefecture ?? "",
                address1: defaults?.address1 ?? "",
                building: defaults?.building ?? "",
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>ご職業</label>
              <select name="occupation" defaultValue={defaults?.occupation ?? ""} className={field}>
                <option value="">選択</option>
                {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>ご希望の連絡方法</label>
              <select name="contact_method" defaultValue={defaults?.contact_method ?? ""} className={field}>
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
