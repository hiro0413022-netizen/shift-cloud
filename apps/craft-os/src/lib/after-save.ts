import { redirect } from "next/navigation";

/**
 * 保存アクションの最後に呼ぶ。【印刷】ボタン（then=print:<doc>）から来たときだけ印刷画面へ飛ばす。
 * redirect は例外で抜けるので、revalidatePath などを済ませてから呼ぶこと。
 */
export function afterSave(formData: FormData, id: number): void {
  const then = String(formData.get("then") ?? "");
  const m = then.match(/^print:(quote|order|cover|spec|thanks)$/);
  if (m) redirect(`/print/${m[1]}/${id}?auto=1`);
}
