import { requireCoachActor } from "@/lib/auth";
import { loadSymptomTree } from "@/lib/data";
import LibraryClient from "./library-client";
import { loadFeatures } from "@/lib/plan";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const actor = await requireCoachActor();
  // ログイン直後の着地点。オンラインレッスンのアカウントは受信箱へ
  if ((await loadFeatures(actor.companyId)).mode === "online") redirect("/online");
  const tree = await loadSymptomTree(actor.companyId);
  return <LibraryClient tree={tree} />;
}
