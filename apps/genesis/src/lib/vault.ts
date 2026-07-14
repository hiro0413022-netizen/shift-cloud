import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";

/**
 * Vault（システム台帳）の入場ゲート。
 * view_hq ログインに加えた二重ゲート。パスワードは VAULT_PASSWORD env が優先、
 * 未設定時は既定パスワードの sha256 ハッシュと照合（平文はコードに置かない）。
 */
export const VAULT_COOKIE = "genesis_vault";

// sha256("hiro1025")
const DEFAULT_HASH = "decc8e4d26bbd6f23e7c3d1f77c611174980d7dbe884d30e98a7c2e17aef68f4";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function vaultHash(): string {
  const pw = process.env.VAULT_PASSWORD;
  return pw ? sha256(pw) : DEFAULT_HASH;
}

export async function isVaultUnlocked(): Promise<boolean> {
  const store = await cookies();
  return store.get(VAULT_COOKIE)?.value === vaultHash();
}
