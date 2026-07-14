import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { cardCls, inputCls, btnCls } from "@/components/ui";
import { INDUSTRIES, STATUSES, type IndustryKey, type StatusKey } from "@/lib/types";
import { createProspect, saveDirective } from "./actions";

export const dynamic = "force-dynamic";

type ProspectRow = {
  id: string;
  name: string;
  industry: string;
  city: string | null;
  status: string;
  score: number | null;
  demo_priority: number | null;
  next_contact_on: string | null;
  next_action: string | null;
  est_build_price: number | null;
  est_monthly_fee: number | null;
};

const FUNNEL: { label: string; keys: StatusKey[] }[] = [
  { label: "候補", keys: ["candidate", "unanalyzed"] },
  { label: "分析済み", keys: ["analyzing", "analyzed", "demo_candidate"] },
  { label: "デモ完成", keys: ["demo_in_progress", "demo_done", "ready"] },
  { label: "連絡中", keys: ["uncontacted", "contacted", "reception