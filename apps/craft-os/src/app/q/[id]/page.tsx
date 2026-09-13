import { redirect } from "next/navigation";

/** 伝票の入口は明細。表紙は別物なので /f/[id] にある */
export default async function QuoteIndex({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/q/${id}/quote`);
}
