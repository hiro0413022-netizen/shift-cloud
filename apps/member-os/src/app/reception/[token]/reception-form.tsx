"use client";

import { useActionState, useRef, useState } from "react";
import { submitReception, type ReceptionState } from "./actions";
import { VISIT_TYPES, OCCUPATIONS, CONTACT_METHODS } from "@/lib/walkin";
import { AddressFields } from "@/components/address-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import { NameFields } from "@/components/name-fields";
import { joinName } from "@/lib/name";
import {
  field, labelCls, cardCls,
  VisitTypePicker, SurveyFields, ConsentField, ReceptionDone, ConfirmSheet,
} from "./reception-ui";

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
 * 店頭タブレットの受付フォーム（初めてのご来店・予約からのご来店）。
 *
 * 入り方（DECISIONS #186 / #226）:
 *   ① /reception/[token] →「初めてのご来店」… 全部お客様に書いていただく
 *   ② /reception/v/[intakeToken] … フィッティング予約からのご来店。
 *      予約フォームでいただいた氏名・カナ・電話・メールは **入力済みで開く**。
 *      同じことを二度書かせない（ユーザー指示 2026-08-29）。
 *   ③ 2回目以降の方は returning-form.tsx（お名前で選ぶだけ・#226）
 */
export function ReceptionForm({
  token,
  storeName,
  visitToken,
  defaults,
  reserve,
  onBack,
}: {
  token: string | null;
  storeName: string | null;
  visitToken?: string;
  defaults?: ReceptionDefaults;
  /** 予約でいただいた内容の読み上げ（スタッフとお客様が確認するだけ・入力欄ではない） */
  reserve?: { label: string; value: string }[];
  /** 入口選択に戻る（/reception/[token] のときだけ） */
  onBack?: () => void;
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

  // 受付完了（予約由来の受付URLは1回きり。読み込み直すと「使用済み」になるので戻るボタンは出さない）
  if (state.ok) {
    return <ReceptionDone onAgain={visitToken ? undefined : () => window.location.reload()} />;
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
        {visitToken ? (
          <div className={`${cardCls} space-y-3`}>
            <p className="text-sm font-semibold text-(--color-txt)">本日のご利用 <span className="text-rose-500">*</span></p>
            <input type="hidden" name="visit_type" value={visitType} />
            <p className="rounded-xl border border-accent bg-accent/10 px-4 py-3 text-center text-sm font-medium text-accent">
              {VISIT_TYPES.find((v) => v.value === visitType)?.label ?? ""}
            </p>
          </div>
        ) : (
          <VisitTypePicker value={visitType} onChange={setVisitType} />
        )}

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

        <SurveyFields visitType={visitType} />
        <ConsentField />

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

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full rounded-xl border border-(--color-line) bg-white py-3 text-sm font-medium text-(--color-dim)"
          >
            ← 最初の画面に戻る
          </button>
        )}
      </form>

      {confirm && (
        <ConfirmSheet
          rows={confirm}
          pending={pending}
          onCancel={() => setConfirm(null)}
          onSubmit={() => {
            setConfirm(null);
            formRef.current?.requestSubmit();
          }}
        />
      )}
    </>
  );
}
