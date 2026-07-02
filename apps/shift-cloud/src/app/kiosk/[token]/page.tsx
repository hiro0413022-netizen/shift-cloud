import { getKioskState } from "./actions";
import { KioskClient } from "./kiosk-client";

export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await getKioskState(token);

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-xl text-zinc-500">この端末は無効です。管理者に連絡してください。</p>
      </div>
    );
  }

  return <KioskClient token={token} storeName={state.storeName} staff={state.staff} />;
}
