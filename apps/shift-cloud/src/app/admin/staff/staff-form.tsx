"use client";

import { useState, useTransition } from "react";
import { saveStaff } from "./actions";
import { Button, Input, Label, Select, Card } from "@/components/ui";
import { useRouter } from "next/navigation";

type Store = { id: string; name: string };
type Role = { id: string; name: string };
export type StaffEdit = {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  login_id: string | null;
  employment_type: string;
  position: string | null;
  store_ids: string[];
  primary_store_id: string | null;
  role_id: string | null;
  hourly_wage: number | null;
  commute_allowance: number;
};

const EMP = [
  ["fulltime", "社員"],
  ["parttime", "アルバイト"],
  ["contractor", "業務委託"],
  ["lesson_pro", "レッスンプロ"],
] as const;

export function StaffForm({ stores, roles, edit }: { stores: Store[]; roles: Role[]; edit?: StaffEdit }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [selStores, setSelStores] = useState<string[]>(edit?.store_ids ?? []);

  function submit(formData: FormData) {
    start(async () => {
      const res = await saveStaff(formData);
      if (res.error) setError(res.error);
      else router.push("/admin/staff");
    });
  }

  return (
    <Card className="max-w-2xl">
      <form action={submit} className="grid grid-cols-2 gap-4">
        {edit && <input type="hidden" name="id" value={edit.id} />}
        <div>
          <Label>氏名 *</Label>
          <Input name="name" defaultValue={edit?.name} required />
        </div>
        <div>
          <Label>フリガナ</Label>
          <Input name="name_kana" defaultValue={edit?.name_kana ?? ""} />
        </div>
        <div>
          <Label>メールアドレス</Label>
          <Input name="email" type="email" defaultValue={edit?.email ?? ""} placeholder="メールなしの場合はログインIDを設定" />
        </div>
        <div>
          <Label>ログインID（メールなしスタッフ用）</Label>
          <Input name="login_id" defaultValue={edit?.login_id ?? ""} />
        </div>
        <div>
          <Label>{edit ? "パスワード再設定（変更時のみ）" : "初期パスワード *（8文字以上）"}</Label>
          <Input name="password" type="password" minLength={8} required={!edit} />
        </div>
        <div>
          <Label>雇用形態</Label>
          <Select name="employment_type" defaultValue={edit?.employment_type ?? "parttime"}>
            {EMP.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>役職</Label>
          <Input name="position" defaultValue={edit?.position ?? ""} placeholder="例: 店舗責任者" />
        </div>
        <div>
          <Label>ロール（権限）</Label>
          <Select name="role_id" defaultValue={edit?.role_id ?? ""} required>
            <option value="">選択してください</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </div>
        <div className="col-span-2">
          <Label>所属店舗（複数可）</Label>
          <div className="flex flex-wrap gap-2">
            {stores.map((s) => (
              <label key={s.id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${selStores.includes(s.id) ? "border-brand bg-brand-light text-brand" : "border-zinc-300 text-zinc-600"}`}>
                <input
                  type="checkbox"
                  name="store_ids"
                  value={s.id}
                  checked={selStores.includes(s.id)}
                  onChange={(e) =>
                    setSelStores((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                    )
                  }
                  className="sr-only"
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>主店舗</Label>
          <Select name="primary_store_id" defaultValue={edit?.primary_store_id ?? ""} required>
            <option value="">選択してください</option>
            {stores.filter((s) => selStores.includes(s.id)).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>時給（円）</Label>
          <Input name="hourly_wage" type="number" min={0} defaultValue={edit?.hourly_wage ?? ""} />
        </div>
        <div>
          <Label>交通費（円/出勤日）</Label>
          <Input name="commute_allowance" type="number" min={0} defaultValue={edit?.commute_allowance ?? 0} />
        </div>
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <div className="col-span-2 flex gap-2">
          <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/admin/staff")}>キャンセル</Button>
        </div>
      </form>
    </Card>
  );
}
