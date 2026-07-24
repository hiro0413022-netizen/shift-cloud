import Link from "next/link";

/** 請求の受取（取引先）/ 支払（委託先）タブ */
export function InvoiceTabs({ active, ym }: { active: "receivable" | "payable"; ym: string }) {
  const base = "rounded-lg px-4 py-1.5 text-sm";
  const on = "bg-(--color-accent) text-white";
  const off = "border border-(--color-line) text-(--color-txt)";
  return (
    <div className="mb-4 flex gap-2">
      <Link href={`/invoices?ym=${ym}`} className={`${base} ${active === "receivable" ? on : off}`}>
        受取（取引先へ請求）
      </Link>
      <Link href={`/invoices/payable?ym=${ym}`} className={`${base} ${active === "payable" ? on : off}`}>
        支払（キャディ→YOZAN請求書）
      </Link>
    </div>
  );
}
