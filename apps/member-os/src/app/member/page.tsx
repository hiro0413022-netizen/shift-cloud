import Link from "next/link";
import QRCode from "qrcode";
import { requireMember, resolveHimeji } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { BOOKING_STATUS_LABEL, jstToday } from "@yozan/core/frank-booking";
import { checkinQrPayload } from "@yozan/core/frank-portal";
import { ensureCheckinToken, currentVisit } from "@/lib/frank-portal";
import { memberLogout, cancelMyBooking } from "./actions";
import { frankSiteUrl } from "@/lib/frank-site-link";
import { VisitPanel } from "./visit-panel";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * FRANK 会員ポータル（#154）
 *
 * お客様の入り口はここ1つ（構想 §3）。上から
 *   ①会員証QR／来店中モード ②予約 ③レッスンカルテ ④注文（来店中のみ） ⑤公式LINE ⑥設定
 * 来店履歴は載せない（ユーザー判断）。「これからのご予約」は予定なので残す。
 */

const notices: Record<string, { text: string; ok?: boolean }> = {
  booked: { text: "ご予約を受け付けました。", ok: true },
  canceled: { text: "予約をキャンセルしました。", ok: true },
  registered: { text: "会員登録が完了しました。さっそくWeb予約をご利用ください。", ok: true },
  reissued: { text: "会員証を再発行しました。古いQRコードは使えなくなります。", ok: true },
};

export default async function MemberHomePage({
  searchParams,
}: {
  searchParams: Promise<{ booked?: string; canceled?: string; registered?: string; reissued?: string; ordered?: string; err?: string }>;
}) {
  const member = await requireMember();
  const store = await resolveHimeji();
  const admin = createAdmin();
  const sp = await searchParams;

  // 台帳は frunk_bookings 一本（#93）。会員は member_no → frunk_members.id で引く
  const { data: me } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  const memberId = (me as Row | null)?.id as string | undefined;

  // 会員証QR: トークンは開いた時に無ければ発行する（既存会員も何もしなくても使えるようになる）
  let qrDataUrl: string | null = null;
  let token: string | null = null;
  if (memberId && !member.isProvisional) {
    token = await ensureCheckinToken(memberId);
    if (token) {
      qrDataUrl = await QRCode.toDataURL(checkinQrPayload(token), {
        margin: 1, width: 320, errorCorrectionLevel: "M",
      });
    }
  }
  const visit = memberId
    ? await currentVisit(memberId)
    : { checkedIn: false, bayName: null, bayCode: null, endTime: null };

  // レッスンカルテ（Lesson OS・#129）: member_no ⇄ lsn_students.member_code、閲覧は共有トークン
  let karteUrl: string | null = null;
  {
    const { data: student } = await admin
      .from("lsn_students").select("id")
      .eq("company_id", member.companyId).eq("member_code", member.memberNo)
      .is("deleted_at", null).limit(1).maybeSingle();
    if (student) {
      const { data: tok } = await admin
        .from("lsn_share_tokens").select("token")
        .eq("student_id", (student as Row).id as string).is("revoked_at", null).limit(1).maybeSingle();
      if (tok?.token) {
        const base = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";
        karteUrl = `${base}/s/${String(tok.token)}`;
      }
    }
  }

  const { data: bookings } = memberId
    ? await admin
        .from("frunk_bookings")
        .select("id, booked_date, start_time, end_time, status, party_size, frunk_bays(name)")
        .eq("member_id", memberId)
        .is("deleted_at", null)
        .order("booked_date", { ascending: false })
        .order("start_time", { ascending: false })
    : { data: [] };

  const all = (bookings ?? []) as Row[];
  const t = jstToday();
  const bayName = (b: Row) => (b.frunk_bays as { name?: string } | null)?.name ?? "打席";
  const upcoming = all.filter((b) => String(b.booked_date) >= t && b.status !== "cancelled");

  const lineUrl = process.env.NEXT_PUBLIC_FRANK_LINE_URL || "";
  const notice = sp.reissued ? notices.reissued : sp.booked ? notices.booked : sp.canceled ? notices.canceled : sp.registered ? notices.registered : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-8">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs tracking-[0.4em] text-(--color-gold)">FRANK GOLF {store?.name ?? "姫路"}</p>
          <h1 className="text-xl font-bold tracking-wide">{member.name} 様</h1>
          <p className="text-xs text-(--color-dim)">会員番号 {member.memberNo}{member.isProvisional ? "（仮登録）" : ""}</p>
        </div>
        <form action={memberLogout}>
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs text-(--color-dim) hover:text-(--color-txt)">ログアウト</button>
        </form>
      </header>

      {notice && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice.text}</p>}
      {sp.ordered && <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{sp.ordered}</p>}
      {sp.err && <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{sp.err}</p>}

      {/* ① 会員証QR ⇄ 来店中モード（かざした瞬間に切り替わる） */}
      {!member.isProvisional && <VisitPanel initial={visit} qrDataUrl={qrDataUrl} token={token} />}

      {/* ② 予約 */}
      <a
        href={frankSiteUrl("booking.html", member.isProvisional ? null : member.memberNo)}
        className="mb-3 block w-full rounded-xl border border-(--color-line) bg-(--color-panel) py-3.5 text-center font-semibold text-(--color-txt) transition-colors hover:bg-(--color-panel-2)"
      >
        ＋ Web予約する
      </a>

      {upcoming.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-(--color-dim)">これからのご予約</h2>
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div key={String(b.id)} className="flex items-center justify-between gap-2 rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
                <div>
                  <p className="font-semibold">{String(b.booked_date)} {String(b.start_time).slice(0, 5)}〜{String(b.end_time).slice(0, 5)}</p>
                  <p className="text-xs text-(--color-dim)">
                    {bayName(b)}{b.party_size && Number(b.party_size) > 1 ? ` ・ ${String(b.party_size)}名` : ""}
                    {b.status === "visited" ? ` ・ ${BOOKING_STATUS_LABEL.visited}` : ""}
                  </p>
                </div>
                {b.status !== "visited" && (
                  <form action={cancelMyBooking}>
                    <input type="hidden" name="id" value={String(b.id)} />
                    <button className="rounded-lg border border-(--color-line) px-3 py-2 text-xs text-(--color-dim) hover:text-red-500">キャンセル</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ③ レッスンカルテ */}
      {karteUrl && (
        <a href={karteUrl} target="_blank" rel="noreferrer" className="mb-3 block w-full rounded-xl border border-(--color-gold)/50 bg-(--color-panel) py-3.5 text-center font-semibold text-(--color-gold) transition-colors hover:bg-(--color-panel-2)">
          📋 レッスンカルテを見る
        </a>
      )}

      {/* ⑤ 公式LINE */}
      {lineUrl && (
        <a href={lineUrl} target="_blank" rel="noreferrer" className="mb-3 block w-full rounded-xl border border-(--color-line) bg-(--color-panel) py-3.5 text-center font-semibold text-(--color-txt) transition-colors hover:bg-(--color-panel-2)">
          公式LINE
        </a>
      )}

      {/* ⑥ 設定 */}
      <Link href="/member/settings" className="mt-2 block text-center text-xs text-(--color-dim) underline underline-offset-4">
        設定・お手続き
      </Link>
    </main>
  );
}
