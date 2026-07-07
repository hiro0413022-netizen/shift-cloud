import { NextResponse } from "next/server";
import { getLegalActor } from "@/lib/auth";
import { signedUrlForFile } from "@/lib/legal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getLegalActor();
  if (!actor) return NextResponse.redirect(new URL("/login?denied=1", _request.url));

  const { id } = await params;
  const url = await signedUrlForFile(actor, id);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
