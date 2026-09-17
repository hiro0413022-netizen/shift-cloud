import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  // scope: "local" = この端末のログインだけを終える。
  // 既定の signOut() は global で、同じアカウントの全端末・全アプリのログインを消す。
  // 店舗アカウント（golfwing 等）は複数のタブレット・アプリで共用しているため、1台でログアウトすると
  // 他の端末が次の操作で白い画面（Application error）になっていた（money-os 2026-09-17）。
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
