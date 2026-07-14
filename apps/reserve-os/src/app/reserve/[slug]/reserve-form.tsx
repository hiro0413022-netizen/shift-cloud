"use client";

import { useActionState } from "react";
import { submitRequest, type SubmitState } from "./actions";
import { useLiff } from "@/lib/use-liff";

function Req() {
  return <span className="ml-1 align-middle text-xs font-bold text-(--color-danger)">必須</span>;
}
function Opt() {
  return <span className="ml-1 align-middle text-[11px] text-(--color-dim)">任意</span>;
}

function Group({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <fieldset className="hud reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      <legend className="px-1 text-sm font-bold text-(--color-accent)">{title}</legend>
      {desc && <p className="mb-3 mt-1 text-xs leading-relaxed text-(--color-dim)">{desc}</p>}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

function L({ label, required, opt, children }: { label: string; required?: boolean; opt?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-(--color-txt)">
        {label}
        {required && <Req />}
        {opt && <Opt />}
      </span>
      {children}
    </label>
  );
}

export type PlanOption = {
  id: string;
  name: string;
  summary: string | null;
  durationMin: number | null;
  price: number;
};

export function ReserveForm({
  slug,
  minDateTime,
  liffId,
  plans,
}: {
  slug: string;
  minDateTime: string;
  liffId?: string;
  plans: PlanOption[];
}) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequest, {});
  // 公式LINEから開かれた場合のみ userId が取れる（DECISIONS #56）。取れたらメールは任意にする。
  const { profile } = useLiff(liffId);
  const onLine = !!profile;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      {profile && (
        <>
          <input type="hidden" name="line_user_id" value={profile.userId} />
          <input type="hidden" name="line_display_name" value={profile.displayName ?? ""} />
        </>
      )}

      {onLine && (
        <p className="rounded-2xl border border-(--color-accent)/30 bg-(--color-accent)/8 px-4 py-3 text-sm text-(--color-accent)">
          LINEと連携済みです。受付確認・確定のご連絡は<b>このLINEのトーク</b>にお送りします。
        </p>
      )}

      {/* ご希望メニュー（DECISIONS #57）— 料金はプラン側が正 */}
      <Group title="ご希望メニュー" desc="ご希望のメニューをお選びください。">
        <div className="space-y-2">
          {plans.map((p, i) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-(--color-line) bg-white px-4 py-3.5 text-sm has-[:checked]:border-(--color-accent) has-[:checked]:bg-(--color-accent)/8"
            >
              <input
                type="radio"
                name="plan_id"
                value={p.id}
                required
                defaultChecked={i === 0}
                className="mt-1 shrink-0 accent-(--color-accent)"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <span className="font-bold text-(--color-accent)">¥{p.price.toLocaleString("ja-JP")}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-(--color-dim)">
                  {p.durationMin ? `${p.durationMin}分` : ""}
                  {p.durationMin && p.summary ? " ・ " : ""}
                  {p.summary ?? ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Group>

      <Group title="お客様情報">
        <L label="お名前" required>
          <input name="name" required placeholder="山田 太郎" className="field" autoComplete="name"
            defaultValue={profile?.displayName ?? ""} />
        </L>
        <L label="ふりがな" required>
          <input name="name_kana" required placeholder="やまだ たろう" className="field" />
        </L>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <L label="電話番号" required>
            <input name="phone" type="tel" required placeholder="090-1234-5678" className="field" autoComplete="tel" />
          </L>
          {/* LINE連携時はメール不要（入力の手間＝離脱要因を減らす） */}
          <L label="メールアドレス" required={!onLine} opt={onLine}>
            <input
              name="email"
              type="email"
              required={!onLine}
              placeholder={onLine ? "控えが必要な方のみ" : "you@example.com"}
              className="field"
              autoComplete="email"
            />
          </L>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <L label="利き手" required>
            <div className="flex gap-2">
              {[["right", "右打ち"], ["left", "左打ち"]].map(([v, t]) => (
                <label key={v} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-(--color-line) bg-white px-3 py-3 text-sm has-[:checked]:border-(--color-accent) has-[:checked]:bg-(--color-accent)/8 has-[:checked]:font-semibold has-[:checked]:text-(--color-accent)">
                  <input type="radio" name="handedness" value={v} required className="accent-(--color-accent)" />
                  {t}
                </label>
              ))}
            </div>
          </L>
          <L label="年齢" required>
            <input name="age" inputMode="numeric" required placeholder="45" className="field" />
          </L>
        </div>
      </Group>

      <Group
        title="ご希望日時（第3希望まで）"
        desc="ご予約はスタッフが空き状況を確認のうえ、後ほど確定のご連絡を差し上げます。ご希望を第3希望までお選びください（3つとも必須）。"
      >
        {[1, 2, 3].map((n) => (
          <L key={n} label={`第${n}希望`} required>
            <input name={`pref${n}_at`} type="datetime-local" required min={minDateTime} className="field" />
          </L>
        ))}
      </Group>

      <Group title="ゴルフについて" desc="当日のフィッティング精度を高めるため、分かる範囲でお聞かせください。">
        <L label="現在の平均スコア" required>
          <input name="avg_score" required placeholder="例: 90〜100 / 100前後" className="field" />
        </L>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <L label="ヘッドスピード" opt>
            <input name="head_speed" placeholder="例: 42m/s（分かれば）" className="field" />
          </L>
          <L label="ゴルフ歴" opt>
            <input name="golf_experience" placeholder="例: 5年" className="field" />
          </L>
        </div>
        <L label="現在の飛距離（ドライバー）" opt>
          <input name="target_distance" placeholder="例: 220ヤード" className="field" />
        </L>
      </Group>

      <Group title="現在お使いのクラブ" desc="お持ちのクラブ情報（任意）。分かる項目だけで結構です。">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <L label="メーカー" opt>
            <input name="club_maker" placeholder="例: テーラーメイド" className="field" />
          </L>
          <L label="モデル" opt>
            <input name="club_model" placeholder="例: Qi10" className="field" />
          </L>
          <L label="シャフト名" opt>
            <input name="club_shaft" placeholder="例: TENSEI" className="field" />
          </L>
          <L label="フレックス" opt>
            <input name="club_flex" placeholder="例: S / SR / R" className="field" />
          </L>
        </div>
      </Group>

      <Group title="ご相談内容">
        <L label="現在の悩み" opt>
          <textarea name="concern" rows={2} placeholder="例: スライスが止まらない、飛距離が落ちてきた など" className="field" />
        </L>
        <L label="改善したいこと" opt>
          <textarea name="improvement" rows={2} placeholder="例: 方向性を安定させたい、あと10ヤード飛ばしたい など" className="field" />
        </L>
        <L label="持ち込み予定のクラブ" opt>
          <input name="bring_clubs" placeholder="例: ドライバー1本 / アイアン数本 など" className="field" />
        </L>
        <L label="その他ご相談" opt>
          <textarea name="other_notes" rows={2} placeholder="ご質問・ご要望など" className="field" />
        </L>
      </Group>

      <label className="flex items-start gap-3 rounded-2xl border border-(--color-line) bg-(--color-panel) p-4 text-sm">
        <input type="checkbox" name="consent" value="1" required className="mt-0.5 h-5 w-5 accent-(--color-accent)" />
        <span className="text-(--color-dim)">
          注意事項（予約・キャンセル・持ち物・お支払い・所要時間）を確認し、同意します。
        </span>
      </label>

      {state.error && (
        <p className="rounded-xl border border-(--color-danger)/30 bg-(--color-danger)/8 px-4 py-3 text-center text-sm font-medium text-(--color-danger)">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="cta">
        {pending ? "送信中…" : "この内容で予約を申し込む"}
      </button>
      <p className="pb-2 text-center text-xs text-(--color-dim)">
        {onLine
          ? "送信後、LINEのトークに受付確認をお送りします。確定のご連絡もLINEで届きます。"
          : "送信後、確認メールをお送りします。確定のご連絡をお待ちください。"}
      </p>
    </form>
  );
}
