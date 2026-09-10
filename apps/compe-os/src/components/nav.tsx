import Link from "next/link";

export const COMP_TABS = [
  { seg: "", label: "ダッシュボード" },
  { seg: "setup", label: "コンペ設定" },
  { seg: "participants", label: "参加者" },
  { seg: "reception", label: "受付" },
  { seg: "grouping", label: "組み合わせ" },
  { seg: "announcement", label: "案内文" },
  { seg: "receipt", label: "領収書" },
  { seg: "scoresheet", label: "スコアシート" },
  { seg: "scoreboard", label: "個人戦" },
  { seg: "teamboard", label: "団体戦" },
  { seg: "prizes", label: "景品" },
  { seg: "survey", label: "アンケート" },
];

export function CompNav({ compId, active }: { compId: string; active: string }) {
  return (
    <nav className="no-print -mx-1 mb-5 flex flex-wrap gap-1 border-b border-(--color-line) pb-2">
      {COMP_TABS.map((t) => {
        const href = t.seg ? `/c/${compId}/${t.seg}` : `/c/${compId}`;
        const on = active === t.seg;
        return (
          <Link
            key={t.seg || "home"}
            href={href}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              on ? "bg-(--color-accent) font-semibold text-white" : "text-(--color-dim) hover:bg-(--color-panel-2)"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
