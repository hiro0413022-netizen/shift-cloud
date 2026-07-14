import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty } from "@/components/ui";
import { CountUp } from "@/components/count-up";

export const dynamic = "force-dynamic";

// Reserve OSは独立アプリ。Genesisは閲覧のみ（確定・返信はReserve OS / シフトアプリのやることリスト経由）。
const RESERVE_OS_URL = process.env.NEXT_PUBLIC_RESERVE_OS_URL ?? "https://shift-cloud-reserve-os.vercel.app";

const STATUS_LABELS: Record<string, string> = {
  pending: "確認待ち",
  confirmed: "確定",
  declined: "見送り",
  canceled: "キャンセル",
  completed: "完了",
};
const STATUS_TONE: Record<string, "accent" | "ok" | "warn" | "danger" | "default"> = {
  pending: "warn",
  confirmed: "ok",
  declined: "danger",
  canceled: "default",
  completed: "ok",
};

type Row = {
  id: string;
  request_seq: number | null;
  service_name: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  source: string;
  pref1_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

const JST = "Asia/Tokyo";

function fmtJst(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: JST, month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
}
function fmtSeq(seq: number | null): string {
  return seq == null ? "R-—" : `R-${String(seq).padStart(4, "0")}`;
}
/** 申込からの経過時間（確認待ちの放置検知用） */
function hoursSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

export default async function ReservePage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const { data } = await admin
    .from("res_requests")
    .select("id, request_seq, service_name, name, phone, email, status, source, pref1_at, confirmed_at, created_at")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as Row[];

  const pending = rows.filter((r) => r.status === "pending");
  const confirmed = rows.filter((r) => r.status === "confirmed");
  const completed = rows.filter((r) => r.status === "completed");
  // 24時間以上 確認待ちのまま = 折り返しが滞っているサイン
  const stale = pending.filter((r) => hoursSince(r.created_at) >= 24);

  const stats = [
    { label: "申込 累計", value: rows.length },
    { label: "確認待ち", value: pending.length },
    { label: "確定", value: confirmed.length },
    { label: "来店完了", value: completed.length },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-wide">予約申込（Reserve OS）</h1>
          <p className="text-xs text-(--color-dim)">
            申込は店舗スタッフの「やること」に自動で積まれます。日程確定・返信はReserve OS側で。ここは閲覧専用です。
          </p>
        </div>
        <a
          href={RESERVE_OS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white transition-colors hover:bg-sky-500"
        >
          Reserve OSを開く ↗
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label}>
            <p className="text-xs text-(--color-dim)">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              <CountUp value={s.value} />
            </p>
          </Panel>
        ))}
      </div>

      {stale.length > 0 && (
        <Panel title="24時間以上 未対応の申込">
          <ul className="divide-y divide-(--color-line)">
            {stale.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <a
                  href={`${RESERVE_OS_URL}/requests/${r.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-medium hover:text-sky-300"
                >
                  {fmtSeq(r.request_seq)} {r.name} 様 / {r.service_name}
                </a>
                <Badge tone="danger">{hoursSince(r.created_at)}時間 未対応</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="確認待ち">
        {pending.length === 0 ? (
          <Empty>確認待ちの申込はありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <a
                    href={`${RESERVE_OS_URL}/requests/${r.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium hover:text-sky-300"
                  >
                    {r.name} 様
                  </a>
                  <p className="text-xs text-(--color-dim)">
                    {fmtSeq(r.request_seq)} ・ {r.service_name} ・ 第1希望 {fmtJst(r.pref1_at)}
                  </p>
                </div>
                <Badge tone={hoursSince(r.created_at) >= 24 ? "danger" : "warn"}>
                  申込 {fmtJst(r.created_at)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="申込一覧（直近500件）">
        {rows.length === 0 ? (
          <Empty>まだ申込はありません</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                  <th className="py-2 pr-3 font-medium">受付番号</th>
                  <th className="py-2 pr-3 font-medium">お客様</th>
                  <th className="py-2 pr-3 font-medium">メニュー</th>
                  <th className="py-2 pr-3 font-medium">第1希望</th>
                  <th className="py-2 pr-3 font-medium">確定日時</th>
                  <th className="py-2 pr-3 font-medium">状態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-line)">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-(--color-panel-2)">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-(--color-dim)">{fmtSeq(r.request_seq)}</td>
                    <td className="py-2 pr-3">
                      <a
                        href={`${RESERVE_OS_URL}/requests/${r.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-sky-300"
                      >
                        {r.name}
                      </a>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-(--color-dim)">{r.service_name}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtJst(r.pref1_at)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">{fmtJst(r.confirmed_at)}</td>
                    <td className="whitespace-nowrap py-2 pr-3">
                      <Badge tone={STATUS_TONE[r.status] ?? "default"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
