import { resolveHimeji } from "@/lib/member";
import { TrialForm } from "./trial-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "体験のお申し込み｜FRANK GOLF 姫路",
  description: "FRANK GOLF 姫路・土山の体験のお申し込みフォーム。ご希望の日時をお送りください。",
};

export default async function TrialPage() {
  const store = await resolveHimeji();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF 姫路・土山</p>
        <h1 className="mt-1 text-2xl font-bold tracking-wide">体験のお申し込み</h1>
        <p className="mt-2 text-sm text-(--color-dim)">
          {store?.name ? "" : ""}
          ご希望の日時をお送りください。担当より折り返し、日程確定のご連絡を差し上げます。
        </p>
      </div>
      <TrialForm />
      <p className="mt-6 text-center text-xs text-(--color-dim)">
        すでに会員の方は <a href="/member/book" className="text-(--color-gold) underline">こちらから打席をWeb予約</a> いただけます。
      </p>
    </main>
  );
}
