"use client";

import { useActionState } from "react";
import { importMembers, importReservations, importTrialReservations, importWalkins, type ImportState } from "./actions";
import { Panel, inputCls, btnCls } from "@/components/ui";

function UploadCard({
  title, desc, action, accept,
}: {
  title: string;
  desc: string;
  action: (prev: ImportState, fd: FormData) => Promise<ImportState>;
  accept: string;
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(action, {});
  return (
    <Panel title={title} className="d1">
      <p className="mb-3 text-sm text-(--color-dim)">{desc}</p>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept={accept} className={inputCls} required />
        <button disabled={pending} className={btnCls}>{pending ? "取込中..." : "取込む"}</button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-emerald-300">✓ {state.message}</p>}
    </Panel>
  );
}

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <header className="reveal">
        <h1 className="text-xl font-bold">データ取込</h1>
        <p className="text-sm text-(--color-dim)">
          Smart Hello の Excel（会員名簿 / 予約一覧）と、現行の一時利用者名簿を取込み、各KPIを自動更新します。
          口座番号・クレジットカード等の機微情報は取り込みません。
        </p>
      </header>

      <UploadCard
        title="会員名簿の取込（会員数・退会率）"
        desc="Smart Hello →会員名簿をExcel/CSVでエクスポートして選択。取込むたびに最新の全件スナップショットで置き換えます（在籍＝スタッフ除く／退会予定は在籍扱い）。"
        action={importMembers}
        accept=".xlsx,.xls"
      />

      <UploadCard
        title="予約一覧の取込（稼働・予約数）"
        desc="Smart Hello →予約一覧を期間指定でエクスポートして選択。予約番号で重複を排除して追記します。打席稼働・パーソナル件数の把握用（体験/フィッティング件数のKPIには使いません）。"
        action={importReservations}
        accept=".xlsx,.xls"
      />

      <UploadCard
        title="体験・フィッティング予約を受付一覧へ反映"
        desc="Smart Hello →予約一覧を選択すると、体験・フィッティングの予約だけを抽出して受付台帳（受付一覧）に自動で追加します（打席・練習・パーソナルは除外）。予約番号で重複排除するので、同じ期間を何度取込んでも二重登録されません。氏名・連絡先も取り込み、後の「会員名簿の取込」で入会が自動反映されます。"
        action={importTrialReservations}
        accept=".xlsx,.xls"
      />

      <UploadCard
        title="一時利用者名簿の取込（体験・フィッティング台帳）"
        desc="現行の「（新）一時利用者名簿.xlsx」を選択。台帳シート（体験/フィッティング/打席）を移行し、体験→入会率・フィッティング→購入率KPIを更新します。取込むたびに移行分を洗い替え（タブレット受付の実来店は保持）。日付・氏名のある行のみ対象。"
        action={importWalkins}
        accept=".xlsx,.xls"
      />
    </div>
  );
}
