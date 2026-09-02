import { createAdmin } from "@/lib/supabase/admin";
import { resolveHimeji } from "@/lib/member";
import { WebJoinForm } from "./web-join-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Web入会申込｜FRANK GOLF 姫路",
  description: "FRANK GOLF 姫路・土山のWeb入会申込フォーム。プランをお選びのうえお申し込みください。",
};

export default async function JoinWebPage({
  searchParams,
}: {
  searchParams: Promise<{ test?: string }>;
}) {
  const store = await resolveHimeji();
  const admin = createAdmin();
  const sp = await searchParams;
  // ?test=1 のときだけ非公開の「テスト会員」プラン（月110円税込）を表示する。
  // 入会手続きの通しテスト用（#136）。一般のお客様のURLには出ない
  const showTest = sp?.test === "1";

  const { data: plans } = store
    ? await admin
        .from("frunk_plans")
        .select("id, name, monthly_price, joining_fee, max_bookings_per_day, note, active, public_signup, is_corporate, max_users, max_open_slots, companion_free")
        .eq("company_id", store.companyId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
    : { data: [] };

  // お客様に出してよいプランだけ（#195）。
  // 以前は active だけで絞っていたため、note に「一般公開しない」と書いてある
  // テスト会員・スタッフ・モニター会員が、そのままお客様の入会フォームに並んでいた。
  // active（画面に出す/出さない）と public_signup（お客様が申し込めるか）は別物として持つ。
  const visiblePlans = (plans ?? []).filter(
    (p) => (p.active && p.public_signup !== false) || (showTest && String(p.name) === "テスト会員"),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF 姫路・土山</p>
        <h1 className="mt-1 text-2xl font-bold tracking-wide">Web入会申込</h1>
        <p className="mt-2 text-sm text-(--color-dim)">
          プランをお選びのうえ、お申し込みください。スタッフ確認後、折り返しご連絡いたします。
        </p>
      </div>
      {showTest && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-500">
          テストモード: 「テスト会員」プラン（月110円税込）が選べます。通しテスト後は Square でサブスクを解約してください。
        </p>
      )}
      <WebJoinForm plans={visiblePlans as never} />
      <p className="mt-6 text-center text-xs text-(--color-dim)">
        まずは体験から、という方は <a href="/trial" className="text-(--color-gold) underline">体験のお申し込み</a> へ。
      </p>
    </main>
  );
}
