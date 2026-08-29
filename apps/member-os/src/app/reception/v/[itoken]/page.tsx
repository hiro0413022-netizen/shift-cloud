import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { ReceptionForm } from "../../[token]/reception-form";

export const dynamic = "force-dynamic";

/**
 * 予約からのご来店受付（DECISIONS #186）
 *
 * 店舗ダッシュボードで「来店」を押すと、この1件だけを開ける鍵つきURLが発行される。
 * 予約フォームでいただいた氏名・カナ・電話・メールは入力済みで開き、
 * お客様には足りない欄（生年月日・ご住所など）とご署名だけお願いする。
 *
 * URLは1回きり・6時間で失効（発行は shift-cloud の markFittingArrived）。
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">GOLF WING</p>
        <h1 className="text-2xl font-bold tracking-wide">ご来店受付</h1>
        <p className="mt-1 text-xs text-(--color-dim)">ご予約ありがとうございます。不足分のご記入をお願いします</p>
      </div>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-6 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-(--color-dim)">{body}</p>
      </div>
    </Shell>
  );
}

type ReserveIntake = {
  service_name?: string | null;
  confirmed_at?: string | null;
  handedness?: string | null;
  head_speed?: string | null;
  club_maker?: string | null;
  club_model?: string | null;
  club_shaft?: string | null;
  club_flex?: string | null;
  bring_clubs?: string | null;
  concern?: string | null;
  improvement?: string | null;
  avg_score?: string | null;
};

function fmtJst(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}

function summary(r: ReserveIntake): { label: string; value: string }[] {
  const club = [r.club_maker, r.club_model, r.club_shaft, r.club_flex]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const rows: { label: string; value: string }[] = [
    { label: "ご予約", value: fmtJst(r.confirmed_at) },
    { label: "メニュー", value: String(r.service_name ?? "") },
    { label: "利き手", value: r.handedness === "left" ? "左打ち" : r.handedness === "right" ? "右打ち" : "" },
    { label: "平均スコア", value: String(r.avg_score ?? "") },
    { label: "ヘッドスピード", value: String(r.head_speed ?? "") },
    { label: "現在のクラブ", value: club },
    { label: "お持ち込み", value: String(r.bring_clubs ?? "") },
    { label: "お悩み", value: String(r.concern ?? "") },
    { label: "良くしたい点", value: String(r.improvement ?? "") },
  ];
  return rows.filter((r2) => r2.value.trim() !== "");
}

export default async function ReservedReceptionPage({ params }: { params: Promise<{ itoken: string }> }) {
  const { itoken } = await params;
  const admin = createAdmin();

  const { data: visit } = await admin
    .from("mbr_walkin_visits")
    .select("id, visit_type, consent_at, survey, intake_token_expires_at, store_id, guest_id, stores(name), mbr_guests(*)")
    .eq("intake_token_hash", hashToken(itoken))
    .is("deleted_at", null)
    .maybeSingle();

  if (!visit)
    return <Notice title="この受付URLは使用済みか無効です" body="お手数ですがスタッフにお声がけください。" />;

  const exp = visit.intake_token_expires_at ? Date.parse(String(visit.intake_token_expires_at)) : 0;
  if (!exp || exp < Date.now())
    return <Notice title="受付URLの有効期限が切れています" body="お手数ですがスタッフにお声がけください。" />;

  const store = (visit.stores ?? null) as { name?: string } | null;
  const guest = (visit.mbr_guests ?? null) as unknown as Record<string, string | null> | null;
  const reserve = ((visit.survey ?? {}) as { reserve?: ReserveIntake }).reserve ?? {};

  return (
    <Shell>
      <ReceptionForm
        token={null}
        visitToken={itoken}
        storeName={store?.name ?? null}
        reserve={summary(reserve)}
        defaults={{
          visit_type: String(visit.visit_type ?? "fitting"),
          name: guest?.name ?? null,
          name_kana: guest?.name_kana ?? null,
          phone: guest?.mobile || guest?.phone || null,
          email: guest?.email ?? null,
          gender: guest?.gender ?? null,
          birth_date: guest?.birth_date ?? null,
          postal_code: guest?.postal_code ?? null,
          prefecture: guest?.prefecture ?? null,
          address1: guest?.address1 ?? null,
          building: guest?.building ?? null,
          occupation: guest?.occupation ?? null,
          contact_method: guest?.contact_method ?? null,
        }}
      />
    </Shell>
  );
}
