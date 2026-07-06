"use client";

import { useActionState } from "react";
import { importMembers, importReservations, type ImportState } from "./actions";
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
      <p className="mb-3 text-sm text-[--color-dim]">{desc}</p>
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
        <h1 className="text-xl font-bold">Smart Hello 取込</h1>
        <p className="text-sm text-[--color-dim]">
          Smart Hello からエクスポートした Excel（会員名簿 / 予約一覧）を取込み、会員数・退会率KPIを自動更新します。
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
        desc="Smart Hello →予約一覧を期間指定でエクスポートして選択。予約番号で重複を排除して追記します。個人情報（住所・電話・生年月日等）は取り込みません。"
        action={importReservations}
        accept=".xlsx,.xls"
      />
    </div>
  );
}
