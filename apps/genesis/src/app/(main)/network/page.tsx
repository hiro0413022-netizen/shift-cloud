import { createAdmin } from "@/lib/supabase/admin";
import { requireGenesisActor } from "@/lib/auth";
import { NetworkMap, type VaultRow } from "./network-ui";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("vault_systems")
    .select("id, name, category, url, notes")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");
  return <NetworkMap vaultSystems={(data ?? []) as VaultRow[]} />;
}
// EOF-network-page
