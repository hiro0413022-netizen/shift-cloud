import { redirect } from "next/navigation";

export default function Root() {
  redirect(`/${process.env.NEXT_PUBLIC_DEFAULT_PRO || "enomoto"}`);
}
