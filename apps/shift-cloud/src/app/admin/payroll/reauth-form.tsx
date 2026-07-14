"use client";

import { useActionState } from "react";
import { verifyPayrollAccess } from "./actions";
import { Button, Input, Label, Card } from "@/components/ui";

export function ReauthForm() {
  const [state, action, pending] = useActionState(verifyPayrollAccess, {});
  return (
    <Card className="max-w-sm">
      <p className="mb-1 text-sm font-medium">追加認証が必要です</p>
      <p className="mb-4 text-xs text-zinc-500">給与情報の保護のため、パスワードを再入力してください（15分間有効）。</p>
      <form action={action} className="space-y-3">
        <div>
          <Label>パスワード</Label>
          <Input name="password" type="password" required autoFocus />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <Button type="submit" className="w-full" disabled={pending}>{pending ? "確認中…" : "認証する"}</Button>
      </form>
    </Card>
  );
}
