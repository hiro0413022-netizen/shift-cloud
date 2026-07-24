import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/store-session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageTitle, Table, Td, Card, Button, Input, Label, Select, Empty, Badge } from "@/components/ui";
import { createHash, randomBytes } from "crypto";

export default async function KiosksPage({ searchParams }: { searchParams: Promise<{ token?: string; created_login?: string; login_error?: string }> }) {
  const actor = await requireActor("manage_kiosks");
  const admin = createAdmin();
  const sp = await searchParams;

  const [{ data: devices }, { data: stores }, { data: storeLogins }] = await Promise.all([
    admin.from("kiosk_devices").select("*, stores(name)").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at"),
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("store_dash_logins").select("id, login_id, status, created_at, stores(name)").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at"),
  ]);

  async function register(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const token = randomBytes(24).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    const row = { store_id: String(formData.get("store_id")), name: String(formData.get("name")) };
    const { data } = await ad.from("kiosk_devices")
      .insert({ ...row, company_id: a.companyId, token_hash: hash })
      .select("id").single();
    await logAudit(a, "kiosk.register", "kiosk_devices", data?.id ?? null, null, row);
    revalidatePath("/admin/kiosks");
    redirect(`/admin/kiosks?token=${token}`);
  }

  async function remove(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("kiosk_devices").update({ deleted_at: new Date().toISOString(), status: "revoked" }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "kiosk.revoke", "kiosk_devices", id);
    revalidatePath("/admin/kiosks");
  }

  async function registerStoreLogin(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const storeId = String(formData.get("store_id"));
    const loginId = String(formData.get("login_id") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!/^[A-Za-z0-9._-]{3,32}$/.test(loginId)) {
      redirect(`/admin/kiosks?login_error=${encodeURIComponent("ログインIDは英数字と . _ - で3〜32文字にしてください")}`);
    }
    if (password.length < 6) {
      redirect(`/admin/kiosks?login_error=${encodeURIComponent("パスワードは6文字以上にしてください")}`);
    }

    // 既存の同一IDチェック（大文字小文字無視）
    const { data: dup } = await ad.from("store_dash_logins").select("id").ilike("login_id", loginId).is("deleted_at", null).maybeSingle();
    if (dup) {
      redirect(`/admin/kiosks?login_error=${encodeURIComponent("このログインIDは既に使われています")}`);
    }

    const { data, error } = await ad.from("store_dash_logins").insert({
      company_id: a.companyId,
      store_id: storeId,
      login_id: loginId,
      password_hash: hashPassword(password),
    }).select("id").single();
    if (error) {
      redirect(`/admin/kiosks?login_error=${encodeURIComponent(error.message)}`);
    }
    await logAudit(a, "store_login.register", "store_dash_logins", data?.id ?? null, null, { store_id: storeId, login_id: loginId });
    revalidatePath("/admin/kiosks");
    redirect(`/admin/kiosks?created_login=${encodeURIComponent(loginId)}`);
  }

  async function removeStoreLogin(formData: FormData) {
    "use server";
    const a = await requireActor("manage_kiosks");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("store_dash_logins").update({ deleted_at: new Date().toISOString(), status: "revoked" }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "store_login.revoke", "store_dash_logins", id);
    revalidatePath("/admin/kiosks");
  }

  return (
    <>
      <PageTitle>打刻端末・店舗ダッシュボード</PageTitle>

      {sp.token && (
        <Card className="mb-4 border-brand bg-brand-light/40">
          <p className="text-sm font-medium">端末を登録しました。iPadで以下のURLを開いてください（この画面でのみ表示されます）:</p>
          <p className="mt-2 break-all rounded bg-white p-3 font-mono text-sm">/kiosk/{sp.token}</p>
          <p className="mt-2 text-xs text-zinc-500">本番URL例: https://あなたのドメイン/kiosk/{sp.token}</p>
        </Card>
      )}

      <p className="mb-3 text-sm font-semibold text-zinc-600">打刻端末（iPad）</p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!devices?.length ? (
            <Empty>端末が登録されていません</Empty>
          ) : (
            <Table headers={["端末名", "店舗", "状態", "登録日", ""]}>
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-50">
                  <Td className="font-medium">{d.name}</Td>
                  <Td>{(d.stores as unknown as { name: string } | null)?.name}</Td>
                  <Td><Badge color={d.status === "active" ? "green" : "zinc"}>{d.status === "active" ? "有効" : "無効"}</Badge></Td>
                  <Td className="text-zinc-500">{d.created_at.slice(0, 10)}</Td>
                  <Td>
                    <form action={remove}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">無効化</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">端末を登録</p>
          <form action={register} className="space-y-3">
            <div>
              <Label>店舗</Label>
              <Select name="store_id" required>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>端末名</Label>
              <Input name="name" required placeholder="例: 宝塚 入口iPad" />
            </div>
            <Button type="submit" className="w-full">登録してURLを発行</Button>
          </form>
        </Card>
      </div>

      {/* ===== 店舗ダッシュボード用ログイン ===== */}
      <p className="mt-10 mb-1 text-sm font-semibold text-zinc-600">店舗ダッシュボード用ログイン</p>
      <p className="mb-3 text-xs text-zinc-400">
        店頭PCが Shift Cloud のログイン画面から「店舗用ID＋パスワード」で店舗ダッシュボード（<span className="font-mono">/store</span>）を開くための資格情報です。
      </p>

      {sp.created_login && (
        <Card className="mb-4 border-brand bg-brand-light/40">
          <p className="text-sm font-medium">店舗ログインを発行しました。ログイン画面で次のIDと設定したパスワードでログインできます:</p>
          <p className="mt-2 break-all rounded bg-white p-3 font-mono text-sm">ログインID: {sp.created_login}</p>
          <p className="mt-2 text-xs text-zinc-500">パスワードは表示されません。控えを店頭に共有してください。</p>
        </Card>
      )}
      {sp.login_error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-600">{sp.login_error}</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!storeLogins?.length ? (
            <Empty>店舗ログインが登録されていません</Empty>
          ) : (
            <Table headers={["ログインID", "店舗", "状態", "発行日", ""]}>
              {storeLogins.map((l) => (
                <tr key={l.id} className="hover:bg-zinc-50">
                  <Td className="font-mono font-medium">{l.login_id}</Td>
                  <Td>{(l.stores as unknown as { name: string } | null)?.name}</Td>
                  <Td><Badge color={l.status === "active" ? "green" : "zinc"}>{l.status === "active" ? "有効" : "無効"}</Badge></Td>
                  <Td className="text-zinc-500">{l.created_at.slice(0, 10)}</Td>
                  <Td>
                    <form action={removeStoreLogin}>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">無効化</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">店舗ログインを発行</p>
          <form action={registerStoreLogin} className="space-y-3">
            <div>
              <Label>店舗（最初に表示）</Label>
              <Select name="store_id" required>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>ログインID</Label>
              <Input name="login_id" required placeholder="例: takarazuka" autoComplete="off" />
            </div>
            <div>
              <Label>パスワード</Label>
              <Input name="password" required placeholder="6文字以上" autoComplete="off" />
            </div>
            <Button type="submit" className="w-full">発行</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
