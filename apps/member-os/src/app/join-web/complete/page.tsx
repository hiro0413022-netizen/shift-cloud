import { checkJoinStatus } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Web入会（即決済・#129）の完了画面。Square決済後にリダイレクトされてくる。
 * 初回決済のWebhook処理（会員番号発行）は数秒〜数十秒かかることがあるため、
 * 会員番号が付くまで5秒ごとに自動更新して待つ。
 */
export default async function JoinCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  const sp = await searchParams;
  const r = await checkJoinStatus(sp.sid ?? "");

  if (r.status === "invalid") {
    return (
      <Shell>
        <p className="text-lg font-semibold">ページの有効期限が切れています</p>
        <p className="mt-2 text-sm text-(--color-dim)">
          ご入会手続きの状況は、メールでお送りする完了のご案内をご確認ください。
          届かない場合はお手数ですが店舗までお問い合わせください。
        </p>
      </Shell>
    );
  }

  if (r.status === "done") {
    return (
      <Shell>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-3xl text-emerald-400">✓</div>
        <p className="mt-3 text-xl font-bold">ご入会ありがとうございます！</p>
        <p className="mt-4 text-sm text-(--color-dim)">{r.name} 様の会員番号</p>
        <p className="mt-1 text-4xl font-bold tracking-widest text-(--color-gold)">{r.memberNo}</p>
        <div className="mt-6 space-y-2 text-left text-sm text-(--color-dim)">
          <p>・入会の控え（PDF）と会員番号を、ご登録のメールアドレスへお送りしました。</p>
          <p>・打席のWeb予約は「会員番号＋電話番号下4桁」でご利用いただけます。</p>
          <p>・レッスンカルテも会員ページからご覧いただけます。</p>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          <a href="https://frankgolf.jp/booking.html" className="rounded-xl bg-accent px-4 py-3 font-semibold text-white">打席を予約する</a>
          <a href="/member/login" className="rounded-xl border border-(--color-line) px-4 py-3 text-(--color-txt)">会員ページへログイン</a>
        </div>
      </Shell>
    );
  }

  // waiting: 決済の確認待ち
  return (
    <Shell>
      <meta httpEquiv="refresh" content="5" />
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-(--color-line) border-t-(--color-gold)" />
      <p className="mt-4 text-lg font-semibold">お支払いを確認しています…</p>
      <p className="mt-2 text-sm text-(--color-dim)">
        決済が完了すると、この画面に会員番号が表示されます（自動で更新されます）。
        <br />
        決済を完了していない場合は、前の画面に戻ってお支払いをお済ませください。
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-(--color-bg) p-6 pt-16">
      <div className="w-full max-w-md rounded-2xl border border-(--color-line) bg-(--color-panel) p-8 text-center">
        <p className="mb-4 text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF</p>
        {children}
      </div>
    </main>
  );
}
