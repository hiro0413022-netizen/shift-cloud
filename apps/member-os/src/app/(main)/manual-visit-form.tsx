"use client";

import { useRef, useState } from "react";
import { Field, inputCls, btnCls } from "@/components/ui";
import { AddressFields } from "@/components/address-fields";
import { BirthDateInput } from "@/components/birth-date-input";
import {
  VISIT_TYPES, REFERRAL_SOURCES, OCCUPATIONS, GENDERS,
  CONTACT_METHODS, DISCOUNTS, PAYMENT_METHODS, RESULTS,
} from "@/lib/walkin";

type Store = { id: string; name: string };

const labelCls = "mb-1 block text-xs text-(--color-dim)";

/**
 * スタッフが手動で一時利用を登録するフォーム（電話・飛び込み等）。
 * タブレット受付と同じ詳細項目をここで最初から入力できる。
 * 送信後は controlled な子（住所・生年月日）も remount してクリアする。
 */
export function ManualVisitForm({
  action,
  stores,
  defaultDate,
}: {
  action: (formData: FormData) => Promise<void>;
  stores: Store[];
  defaultDate: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [resetKey, setResetKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false); // 詳細（住所・アンケート等）の開閉

  return (
    <form
      ref={formRef}
      action={async (fd) => {
        setPending(true);
        try {
          await action(fd);
          formRef.current?.reset();
          setResetKey((k) => k + 1);
        } finally {
          setPending(false);
        }
      }}
      className="space-y-4"
    >
      {/* 来店情報 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="日付">
          <input type="date" name="visited_on" defaultValue={defaultDate} className={inputCls} />
        </Field>
        <Field label="利用区分">
          <select name="visit_type" className={inputCls} defaultValue="trial">
            {VISIT_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="お名前">
          <input name="name" placeholder="山田 太郎" className={inputCls} />
        </Field>
        <Field label="フリガナ">
          <input name="name_kana" placeholder="ヤマダ タロウ" className={inputCls} />
        </Field>
        <Field label="電話番号">
          <input name="phone" type="tel" inputMode="tel" placeholder="079-..." className={inputCls} />
        </Field>
        <Field label="携帯番号">
          <input name="mobile" type="tel" inputMode="tel" placeholder="090-..." className={inputCls} />
        </Field>
        <Field label="メールアドレス">
          <input name="email" type="email" placeholder="example@mail.com" className={inputCls} />
        </Field>
        <Field label="利用料">
          <input name="fee" inputMode="numeric" placeholder="5500" className={inputCls} />
        </Field>
      </div>

      {/* 詳細（住所・生年月日など。タブレット受付と同じ項目） */}
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold text-(--color-dim) underline decoration-dotted underline-offset-4 hover:text-accent"
        >
          {open ? "▾ 詳細（住所・生年月日・成約など）を閉じる" : "▸ 詳細（住所・生年月日・成約など）を入力する"}
        </button>

        {open && (
          <div key={resetKey} className="mt-3 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <BirthDateInput inputClassName={inputCls} labelClassName={labelCls} className="col-span-2" />
              <Field label="性別">
                <select name="gender" defaultValue="" className={inputCls}>
                  <option value="">選択</option>
                  {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </Field>
              <Field label="ご職業">
                <select name="occupation" defaultValue="" className={inputCls}>
                  <option value="">選択</option>
                  {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AddressFields inputClassName={inputCls} labelClassName={labelCls} wideClassName="col-span-2" />
              <Field label="ご希望の連絡方法">
                <select name="contact_method" defaultValue="" className={inputCls}>
                  <option value="">選択</option>
                  {CONTACT_METHODS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="割引">
                <select name="discount" defaultValue="" className={inputCls}>
                  <option value="">割引なし</option>
                  {DISCOUNTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="支払方法">
                <select name="payment_method" defaultValue="" className={inputCls}>
                  <option value="">選択</option>
                  {PAYMENT_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="担当プロ">
                <input name="pro_staff" placeholder="担当プロ" className={inputCls} />
              </Field>
              <Field label="成約結果">
                <select name="result" defaultValue="none" className={inputCls}>
                  {RESULTS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label === "—" ? "成約なし" : r.label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="経路の詳細">
                <input name="referral_source_other" placeholder="紹介者名など" className={inputCls} />
              </Field>
              <Field label="再アプローチ予定日">
                <input type="date" name="reapproach_date" className={inputCls} />
              </Field>
              <Field label="備考・顧客メモ">
                <input name="note" placeholder="フォロー状況・連絡時の注意など" className={`${inputCls} sm:col-span-2`} />
              </Field>
            </div>
          </div>
        )}
      </div>

      {/* 経路・店舗・登録 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="経路">
          <select name="referral_source" className={inputCls} defaultValue="">
            <option value="">-</option>
            {REFERRAL_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        {stores.length > 1 && (
          <Field label="店舗">
            <select name="store_id" className={inputCls}>
              <option value="">-</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button disabled={pending} className={`${btnCls} w-full justify-center`}>
            {pending ? "登録中…" : "＋ 登録"}
          </button>
        </div>
      </div>
    </form>
  );
}
