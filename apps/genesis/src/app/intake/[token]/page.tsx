import { createAdmin } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/intake";
import { IntakeForm } from "./intake-form";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-[0.4em] text-[--color-gold]">GOLF WING</p>
        <h1 className="text-2xl font-bold tracking-wide">体験受付</h1>
      </div>
      {children}
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-6 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="mt-2 text-sm text-[--color-dim]">{body}</p>
      </div>
    </Shell>
  );
}

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: tok } = await admin
    .from("mbr_intake_tokens")
    .select("company_id, booking_id, used_at, expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (!tok) return <Notice title="受付URLが無効です" body="お手数ですがスタッフにお声がけください。" />;
  if (tok.used_at) return <Notice title="受付は完了しています" body="ご記入ありがとうございました。スタッフにお声がけください。" />;
  if (new Date(tok.expires_at as string).getTime() < Date.now())
    return <Notice title="受付URLの有効期限が切れています" body="お手数ですがスタッフにお声がけください。" />;

  const { data: booking } = await admin
    .from("mbr_trial_bookings")
    .select("program, lesson_date, mbr_guests(name, name_kana, mobile)")
    .eq("id", tok.booking_id as string)
    .single();

  const guest = (booking?.mbr_guests ?? null) as Record<string, unknown> | null;

  return (
    <Shell>
      <IntakeForm
        token={token}
        program={booking?.program ? String(booking.program) : null}
        lessonDate={booking?.lesson_date ? String(booking.lesson_date) : null}
        prefill={{
          name: guest?.name ? String(guest.name) : "",
          name_kana: guest?.name_kana ? String(guest.name_kana) : "",
          mobile: guest?.mobile ? String(guest.mobile) : "",
        }}
      />
    </Shell>
  );
}
