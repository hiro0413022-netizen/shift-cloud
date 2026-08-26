import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { bayQrUrl } from "@yozan/core/frank-portal";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * 打席QRの印刷シート（#154 / 構想 §6）
 *
 * 貼るのは打席1つにつき1枚だけ。会員用とビジター用は分けない
 * （開いた瞬間のログイン状態で自動的に分かれるので、間違えて読むということが起きない）。
 *
 * URLは既定でこの画面を開いているホストから作る＝ my.frankgolf.jp のDNSが未設定でも
 * そのまま使える。独自ドメインが通ったら NEXT_PUBLIC_PORTAL_URL を入れて刷り直す。
 */
export default async function BayQrPage() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.NEXT_PUBLIC_PORTAL_URL || `${proto}://${host}`;

  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bays").select("id, code, name")
    .eq("active", true).is("deleted_at", null)
    .order("sort", { ascending: true });

  const bays = await Promise.all(
    ((data ?? []) as Row[]).map(async (b) => {
      const url = bayQrUrl(base, String(b.code));
      return {
        code: String(b.code),
        name: String(b.name),
        url,
        png: await QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: "Q" }),
      };
    }),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">打席QR 印刷シート</h1>
          <p className="mt-1 text-xs text-(--color-dim)">
            各打席に1枚ずつ貼ってください。会員は会員価格＋登録カードで、ビジターは登録不要で注文できます。<br />
            現在の宛先: <code className="text-(--color-accent)">{base}</code>
          </p>
        </div>
        <Link href="/orders" className="text-sm text-(--color-dim) underline underline-offset-4">← 電子伝票</Link>
      </div>

      {bays.length === 0 && <p className="py-10 text-center text-sm text-(--color-dim)">稼働中の打席がありません</p>}

      {bays.map((b) => (
        <section
          key={b.code}
          className="mb-6 break-after-page rounded-2xl border border-(--color-line) bg-white px-8 py-10 text-center print:mb-0 print:rounded-none print:border-0"
        >
          <p className="text-sm tracking-[0.5em] text-(--color-gold)">FRANK GOLF</p>
          <h2 className="mt-2 text-5xl font-bold tracking-wide text-(--color-txt)">{b.name}</h2>
          <p className="mt-4 text-xl text-(--color-txt)">スマホで読み取ると、この打席にドリンクをお持ちします</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.png} alt={`${b.name} 注文用QR`} className="mx-auto mt-6 h-auto w-[300px]" />
          <p className="mt-4 text-base text-(--color-dim)">会員の方はログインすると会員価格になります</p>
          <p className="mt-6 text-[10px] text-(--color-dim)">{b.url}</p>
        </section>
      ))}
    </main>
  );
}
