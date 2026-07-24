"use client";

import { useState } from "react";
import { Badge, Field, inputCls, btnGhostCls } from "@/components/ui";
import {
  VISIT_TYPE_LABEL,
  RESULTS,
  DISCOUNTS,
  PAYMENT_METHODS,
  GENDERS,
  GENDER_LABEL,
  OCCUPATIONS,
  CONTACT_METHODS,
} from "@/lib/walkin";
import { updateVisit, updateGuest, deleteVisit } from "./actions";

type Row = Record<string, unknown>;

const TYPE_TONE: Record<string, "default" | "ok" | "warn" | "danger" | "accent"> = {
  trial: "accent",
  fitting: "ok",
  bay: "default",
  visitor_bay: "default",
  other: "default",
};

function s(v: unknown): string {
  return v == null ? "" : String(v);
}

export function VisitRow({ v, guest, rec }: { v: Row; guest: Row | null; rec: Row | null }) {
  const [open, setOpen] = useState(false);
  const vtype = s(v.visit_type);
  const name = guest?.name ? s(guest.name) : "（氏名未入力）";
  const selfDone = !!v.consent_at;

  // 住所を1行に整形（詳細サマリ表示用）
  const fullAddress = [guest?.postal_code && `〒${s(guest.postal_code)}`, s(guest?.prefecture), s(guest?.address1), s(guest?.building)]
    .filter(Boolean)
    .join(" ");

  // アンケート（自己入力）
  const survey = (v.survey ?? null) as Row | null;
  const surveyLines: string[] = [];
  if (survey) {
    const arr = (k: string) => (Array.isArray(survey[k]) ? (survey[k] as unknown[]).map(String) : []);
    const reasons = [...arr("trial_reasons"), ...arr("fitting_reasons"), ...arr("school_goals")];
    if (reasons.length) surveyLines.push(`目的・きっかけ: ${reasons.join("、")}`);
    if (survey.join_interest) surveyLines.push(`入会意向: ${s(survey.join_interest)}`);
    if (survey.comment) surveyLines.push(`コメント: ${s(survey.comment)}`);
  }

  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={TYPE_TONE[vtype] ?? "default"}>{VISIT_TYPE_LABEL[vtype] ?? vtype}</Badge>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="font-semibold text-(--color-txt) underline decoration-dotted decoration-(--color-dim) underline-offset-4 hover:text-accent"
            title="クリックで住所などの詳細を表示・編集"
          >
            {name}
          </button>
          {guest?.name_kana ? <span className="text-xs text-(--color-dim)">{s(guest.name_kana)}</span> : null}
          {v.result === "join" ? <Badge tone="gold">入会</Badge> : null}
          {v.result === "purchase" ? <Badge tone="ok">購入</Badge> : null}
          {selfDone ? <Badge tone="ok">自己入力済</Badge> : null}
        </div>
        <div className="text-xs text-(--color-dim)">
          {[
            s(v.visited_on),
            guest?.phone && s(guest.phone),
            v.referral_source && `経路 ${s(v.referral_source)}`,
            rec?.name && `受付 ${s(rec.name)}`,
          ]
            .filter(Boolean)
            .join("　")}
        </div>
      </div>

      {/* 名前クリックで開く：顧客情報の詳細表示＋後追い入力 */}
      {open ? (
        <div className="mt-3 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
          {/* 詳細サマリ（現在の登録内容） */}
          <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            <Detail label="住所">{fullAddress || "—"}</Detail>
            <Detail label="電話">{s(guest?.phone) || "—"}</Detail>
            <Detail label="携帯">{s(guest?.mobile) || "—"}</Detail>
            <Detail label="メール">{s(guest?.email) || "—"}</Detail>
            <Detail label="性別">{guest?.gender ? GENDER_LABEL[s(guest.gender)] ?? s(guest.gender) : "—"}</Detail>
            <Detail label="生年月日">{s(guest?.birth_date) || "—"}</Detail>
            <Detail label="ご職業">{s(guest?.occupation) || "—"}</Detail>
            <Detail label="連絡方法">{s(guest?.contact_method) || "—"}</Detail>
            <Detail label="備考">{s(guest?.note) || "—"}</Detail>
          </dl>

          {surveyLines.length > 0 ? (
            <div className="mb-4 rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
              {surveyLines.map((l, i) => (
                <p key={i} className={i > 0 ? "mt-1" : ""}>
                  {l}
                </p>
              ))}
            </div>
          ) : null}

          {/* 後追い入力フォーム（住所などを後から登録・編集） */}
          <p className="mb-2 text-xs font-semibold text-(--color-dim)">
            顧客情報を後追いで入力 {guest ? "" : "（この受付はまだ顧客情報が未登録です）"}
          </p>
          <form
            key={`guest-${s(v.id)}-${s(v.updated_at ?? "")}`}
            action={updateGuest}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            <input type="hidden" name="visit_id" value={s(v.id)} />
            <Field label="お名前">
              <input name="name" defaultValue={s(guest?.name)} placeholder="山田 太郎" className={inputCls} />
            </Field>
            <Field label="フリガナ">
              <input name="name_kana" defaultValue={s(guest?.name_kana)} placeholder="ヤマダ タロウ" className={inputCls} />
            </Field>
            <Field label="性別">
              <select name="gender" defaultValue={s(guest?.gender)} className={inputCls}>
                <option value="">選択</option>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="生年月日">
              <input type="date" name="birth_date" defaultValue={s(guest?.birth_date)} className={inputCls} />
            </Field>
            <Field label="郵便番号">
              <input name="postal_code" defaultValue={s(guest?.postal_code)} placeholder="670-0000" className={inputCls} />
            </Field>
            <Field label="都道府県">
              <input name="prefecture" defaultValue={s(guest?.prefecture)} placeholder="兵庫県" className={inputCls} />
            </Field>
            <Field label="住所（市区町村・番地）">
              <input name="address1" defaultValue={s(guest?.address1)} placeholder="姫路市〇〇町1-2-3" className={`${inputCls} col-span-2`} />
            </Field>
            <Field label="建物・部屋">
              <input name="building" defaultValue={s(guest?.building)} placeholder="〇〇マンション101" className={inputCls} />
            </Field>
            <Field label="電話番号">
              <input name="phone" defaultValue={s(guest?.phone)} placeholder="079-..." className={inputCls} />
            </Field>
            <Field label="携帯番号">
              <input name="mobile" defaultValue={s(guest?.mobile)} placeholder="090-..." className={inputCls} />
            </Field>
            <Field label="メールアドレス">
              <input name="email" type="email" defaultValue={s(guest?.email)} placeholder="example@mail.com" className={inputCls} />
            </Field>
            <Field label="ご職業">
              <select name="occupation" defaultValue={s(guest?.occupation)} className={inputCls}>
                <option value="">選択</option>
                {OCCUPATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="連絡方法">
              <select name="contact_method" defaultValue={s(guest?.contact_method)} className={inputCls}>
                <option value="">選択</option>
                {CONTACT_METHODS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="備考（顧客メモ）">
              <input name="guest_note" defaultValue={s(guest?.note)} placeholder="連絡時の注意など" className={`${inputCls} col-span-2 sm:col-span-3`} />
            </Field>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button className={`${btnGhostCls} w-full justify-center`}>顧客情報を保存</button>
            </div>
          </form>
        </div>
      ) : null}

      {/* スタッフ追記（保存のたびにupdated_atで再マウント→編集値が確実に反映される） */}
      <form
        key={`edit-${s(v.id)}-${s(v.updated_at ?? "")}`}
        action={updateVisit}
        className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6"
      >
        <input type="hidden" name="id" value={s(v.id)} />
        <select name="result" defaultValue={s(v.result ?? "none")} className={`${inputCls} !py-1`}>
          {RESULTS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label === "—" ? "成約なし" : r.label}
            </option>
          ))}
        </select>
        <input name="fee" defaultValue={v.fee != null ? s(v.fee) : ""} inputMode="numeric" placeholder="利用料" className={`${inputCls} !py-1`} />
        <select name="discount" defaultValue={v.discount ? s(v.discount) : ""} className={`${inputCls} !py-1`}>
          <option value="">割引なし</option>
          {DISCOUNTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select name="payment_method" defaultValue={v.payment_method ? s(v.payment_method) : ""} className={`${inputCls} !py-1`}>
          <option value="">支払-</option>
          {PAYMENT_METHODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <input name="pro_staff" defaultValue={v.pro_staff ? s(v.pro_staff) : ""} placeholder="担当プロ" className={`${inputCls} !py-1`} />
        <input name="reapproach_date" type="date" defaultValue={v.reapproach_date ? s(v.reapproach_date) : ""} className={`${inputCls} !py-1`} />
        <input name="note" defaultValue={v.note ? s(v.note) : ""} placeholder="備考・フォロー状況" className={`${inputCls} !py-1 col-span-2 sm:col-span-5`} />
        <button className={btnGhostCls}>保存</button>
      </form>

      <div className="mt-1 flex justify-end">
        <form action={deleteVisit}>
          <input type="hidden" name="id" value={s(v.id)} />
          <button className="text-xs text-(--color-dim) hover:text-red-400">削除</button>
        </form>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-(--color-dim)">{label}</dt>
      <dd className="text-(--color-txt) break-words">{children}</dd>
    </div>
  );
}
