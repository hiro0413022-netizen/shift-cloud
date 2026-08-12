import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessGolfWing } from "@/lib/store-scope";
import { importMembers, importReservations, importWalkins } from "./actions";
import { UploadCard } from "./upload-card";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const actor = await requireReceptionActor();
  // 取込先はGOLF WING宝塚固定。宝塚に配属されていない人には画面ごと出さない（#134）
  if (!(await canAccessGolfWing(actor))) notFound();

  return (
    <div className="space-y-4">
      <header className="reveal">
        <h1 className="text-xl font-bold">データ取込 — GOLF WING 宝塚</h1>
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
        title="一時利用者名簿の取込（体験・フィッティング台帳）"
        desc="現行の「（新）一時利用者名簿.xlsx」を選択。台帳シート（体験/フィッティング/打席）を移行し、体験→入会率・フィッティング→購入率KPIを更新します。取込むたびに移行分を洗い替え（タブレット受付の実来店は保持）。日付・氏名のある行のみ対象。"
        action={importWalkins}
        accept=".xlsx,.xls"
      />
    </div>
  );
}
