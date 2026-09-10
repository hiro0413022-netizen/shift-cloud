import { NextResponse } from "next/server";
import { signOutCast } from "@/lib/cast";

export async function POST(request: Request) {
  await signOutCast();
  return NextResponse.redirect(new URL("/cast/login", request.url), { status: 303 });
}
