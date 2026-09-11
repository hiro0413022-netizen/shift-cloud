import { notFound } from "next/navigation";
import { jstYmd } from "@yozan/core/jst";
import { countEntries, entryGate, getCompByEntrySlug } from "@/lib/compe";
import { dateJa, yen } from "@/lib/format";
import { EntryForm } from "./entry-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompByEntrySlug(slug);
  return { title: comp ? `${comp.name} 参加申し込み` : "参加申し込み" };
}

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { slug } = await params;
  const { done } = await searchParams;
  const comp = await getCompByEntrySlug(slug);
  if (!comp) notFound();

  const gate = entryGate(comp, jstYmd());
  const { taken, waitlist } = await countEntries(comp.id);
  const capacity = comp.entry_capacity;
  const remaining = capacity != null ? Math.max(capacity - taken, 0) : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-6 rounded-2xl bg-(--color-accent) px-6 py-7 text-center text-white">
        <p className="text-xs tracking-[0.3em] opacity-80">{comp.organizer ?? "GOLF WING"}</p>
        <h1 className="mt-1 text-xl font-bold sm:text-2xl">{comp.name}</h1>
        <p className="mt-2 text-sm opacity-90">参加申し込みフォーム</p>
      </header>

      {done && <DoneMessage done={done} />}

      <section className="mb-6 rounded-2xl border border-(--color-line) bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">開催概要</h2>
        <dl className="space-y-2 text-sm">
          <Row label="開催日" value={dateJa(comp.held_on)} />
          <Row label="会場" value={[comp.venue, comp.course].filter(Boolean).join("　")} />
          {comp.start_time && <Row label="トップスタート" value={comp.start_time} />}
          {comp.meet_time && <Row label="集合" value={comp.meet_time} />}
          <Row label="参加費" value={yen(comp.fee)} />
          {comp.play_fee != null && <Row label="プレー代" value={`${yen(comp.play_fee)}（当日精算）`} />}
          {capacity != null && (
            <Row
              label="募集人数"
              value={`${capacity}名${remaining != null ? `（残り ${remaining}名）` : ""}`}
            />
          )}
          {comp.contact && <Row label="お問い合わせ" value={comp.contact} />}
        </dl>
        {comp.entry_note && (
          <p className="mt-4 rounded-xl bg-(--color-panel-2) p-3 text-sm whitespace-pre-wrap">{comp.entry_note}</p>
        )}
      </section>

      {!gate.ok ? (
        <Closed gate={gate} />
      ) : done ? null : (
        <section className="rounded-2xl border border-(--color-line) bg-white p-5">
          <h2 className="mb-1 text-sm font-bold">お申し込み</h2>
          {remaining === 0 ? (
            <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              定員（{capacity}名）に達しました。ここからは<strong>キャンセル待ち</strong>としてお預かりし、
              空きが出ましたら順にご連絡いたします。
            </p>
          ) : (
            <p className="mb-4 text-xs text-(--color-dim)">
              先着順です。ご記入いただいた電話番号に、確定のご連絡を差し上げます。
            </p>
          )}
          <EntryForm slug={slug} waitlistMode={remaining === 0} />
        </section>
      )}

      {waitlist > 0 && gate.ok && (
        <p className="mt-3 text-center text-xs text-(--color-dim)">
          現在キャンセル待ち {waitlist}名
        </p>
      )}

      <p className="mt-8 text-center text-xs text-(--color-dim)">
        {comp.organizer ?? "GOLF WING"}
        {comp.contact ? `　${comp.contact}` : ""}
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-(--color-dim)">{label}</dt>
      <dd className="font-semibold">{value || "—"}</dd>
    </div>
  );
}

function DoneMessage({ done }: { done: string }) {
  const map: Record<string, { tone: string; title: string; body: string }> = {
    applied: {
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      title: "お申し込みを受け付けました",
      body: "ありがとうございます。組み合わせなど詳細が決まりましたら、あらためてご連絡いたします。",
    },
    waitlist: {
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "キャンセル待ちで承りました",
      body: "定員に達しているため、キャンセル待ちとしてお預かりしました。空きが出ましたら順にご連絡いたします。",
    },
    already: {
      tone: "border-(--color-line) bg-(--color-panel-2) text-(--color-txt)",
      title: "すでにお申し込みいただいています",
      body: "同じ電話番号でのお申し込みを確認しました。ご変更やキャンセルはお電話でご連絡ください。",
    },
  };
  const m = map[done] ?? map.applied;
  return (
    <div className={`mb-6 rounded-2xl border p-5 ${m.tone}`}>
      <p className="font-bold">{m.title}</p>
      <p className="mt-1 text-sm">{m.body}</p>
    </div>
  );
}

function Closed({ gate }: { gate: Exclude<ReturnType<typeof entryGate>, { ok: true }> }) {
  const text =
    gate.reason === "before"
      ? `お申し込みの受付は ${dateJa(gate.opensOn ?? null)} からです。`
      : gate.reason === "after"
        ? `お申し込みの受付は ${dateJa(gate.closesOn ?? null)} で締め切りました。`
        : "現在、お申し込みの受付は行っておりません。";
  return (
    <section className="rounded-2xl border border-(--color-line) bg-(--color-panel-2) p-6 text-center">
      <p className="text-sm font-semibold">{text}</p>
      <p className="mt-1 text-xs text-(--color-dim)">お問い合わせは店舗までお願いいたします。</p>
    </section>
  );
}
