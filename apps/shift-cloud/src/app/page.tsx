import { redirect } from "next/navigation";
import { getActor, isAdmin } from "@/lib/auth";

export default async function Root() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.permissions.view_hq) redirect("/hq");
  if (isAdmin(actor)) redirect("/admin/staff");
  redirect("/home");
}
