"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { assignRole, toggleStatus, issueLogin, resetPassword, createStaff } from "./actions";

export type Perms = {
  view_hq?: boolean;
  read_only?: boolean;
  use_lesson?: boolean;
  use_reception?: boolean;
  manage_staff?: boolean;
};
export type StaffRow = {
  id: string;
  name: string;
  login_id: string | null;
  status: string;
  hasLogin: boolean;
  roleId: string | null;
  roleName: string;
  perms: Perms;
};
export type Role = { id: string; name: string };

const EMP = [
  ["fulltime", "社員"],
  ["parttime", "アルバイト"],
  ["contractor", "業務委託"],
  ["lesson_pro", "レッスンプロ"],
] as const;

function access(r: StaffRow) {
  const hq = !!r.perms.view_hq && !r.perms.read_only;
  return {
    hq, // 本部系: Genesis / Money / Legal / Caddy / Survey
    kintai: r.hasLogin && r.status === "active", // Shift Cloud
    uketsuke: !!r.perms.use_reception || hq, // Member / Reserve
    lesson: !!r.perms.use_lesson || hq, // Lesson OS
  };
}

function Dot({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-block h-2 w-2 rounded-full bg-sky-400" title="アクセス可" />
  ) : (
    <span className="text-(--color-dim)">·</span>
  );
}

export function AccountsTable({ staff, roles }: { staff: StaffRow[]; roles: Role[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  function run(fd: FormData, fn: (f: FormData) => Promise<{ error?: string }>, id: string, okText: string) {
    start(async () => {
      const res = await fn(fd);
      if (res.error) setMsg({ id, text: res.error, ok: false });
      else {
        setMsg({ id, text: okText, ok: true });
        setOpen(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-(--color-line)">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-(--color-panel-2) text-left text-xs text-(--color-dim)">
              <th className="px-3 py-2 font-medium">氏名 / 役割</th>
              <th className="px-2 py-2 text-center font-medium">ログイン</th>
              <th className="px-2 py-2 text-center font-medium" title="Genesis・Money・Legal・Caddy・Survey">本部系</th>
              <th className="px-2 py-2 text-center font-medium" title="Shift Cloud">勤怠</th>
              <th className="px-2 py-2 text-center font-medium" title="Member OS・Reserve OS">受付</th>
              <th className="px-2 py-2 text-center font-medium" title="Lesson OS">Lesson</th>
              <th className="px-2 py-2 text-center font-medium">状態</th>
              <th className="px-2 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-line)">
            {staff.map((r) => {
              const a = access(r);
              const wantsButCant = !r.hasLogin && (a.hq || a.lesson || a.uketsuke);
              const isOpen = open === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className={r.status !== "active" ? "opacity-50" : ""}>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.name}</div>
                      <form
                        action={(fd) => run(fd, assignRole, r.id, "役割を更新しました")}
                        className="mt-1 flex items-center gap-1"
                      >
                        <input type="hidden" name="staff_id" value={r.id} />
                        <select
                          name="role_id"
                          defaultValue={r.roleId ?? ""}
                          className={`${inputCls} h-7 py-0 text-xs`}
                          onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        >
                          <option value="" disabled>
                            役割を選択
                          </option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </form>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {r.hasLogin ? (
                        <span className="text-emerald-400" title={r.login_id ?? ""}>✓</span>
                      ) : (
                        <span className="text-(--color-dim)">未</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center"><Dot on={a.hq} /></td>
                    <td className="px-2 py-2 text-center"><Dot on={a.kintai} /></td>
                    <td className="px-2 py-2 text-center"><Dot on={a.uketsuke} /></td>
                    <td className="px-2 py-2 text-center"><Dot on={a.lesson} /></td>
                    <td className="px-2 py-2 text-center">
                      <form action={(fd) => run(fd, toggleStatus, r.id, "状態を切替えました")}>
                        <input type="hidden" name="staff_id" value={r.id} />
                        <button
                          className={`rounded px-2 py-0.5 text-xs ${
                            r.status === "active"
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-red-500/15 text-red-300"
                          }`}
                          disabled={pending}
                        >
                          {r.status === "active" ? "有効" : "停止中"}
                        </button>
                      </form>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        className={`${btnGhostCls} text-xs`}
                        onClick={() => setOpen(isOpen ? null : r.id)}
                      >
                        {r.hasLogin ? "PW再発行" : "ログイン発行"}
                      </button>
                    </td>
                  </tr>
                  {wantsButCant && (
                    <tr key={`${r.id}-warn`}>
                      <td colSpan={8} className="bg-amber-500/10 px-3 py-1 text-xs text-amber-300">
                        ⚠ 権限は付与されていますが、ログイン未発行のため実際には入れません。右の「ログイン発行」で発行してください。
                      </td>
                    </tr>
                  )}
                  {isOpen && (
                    <tr key={`${r.id}-form`}>
                      <td colSpan={8} className="bg-(--color-panel-2) px-3 py-3">
                        {r.hasLogin ? (
                          <form
                            action={(fd) => run(fd, resetPassword, r.id, "パスワードを再発行しました")}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="staff_id" value={r.id} />
                            <span className="text-xs text-(--color-dim)">新しいパスワード（8文字以上）:</span>
                            <input name="password" type="text" autoComplete="off" className={`${inputCls} w-56`} required />
                            <button className={btnCls} disabled={pending}>再発行</button>
                          </form>
                        ) : (
                          <form
                            action={(fd) => run(fd, issueLogin, r.id, "ログインを発行しました")}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <input type="hidden" name="staff_id" value={r.id} />
                            <input
                              name="login_id"
                              placeholder="ログインID（英数字）"
                              defaultValue={r.login_id ?? ""}
                              className={`${inputCls} w-48`}
                              required
                            />
                            <input name="password" type="text" placeholder="初期パスワード（8文字以上）" autoComplete="off" className={`${inputCls} w-56`} required />
                            <button className={btnCls} disabled={pending}>発行</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  )}
                  {msg?.id === r.id && (
                    <tr key={`${r.id}-msg`}>
                      <td colSpan={8} className={`px-3 py-1 text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>
                        {msg.text}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-(--color-dim)">
        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" /> アクセス可 ／ 役割を変えると各システムのアクセスが一括で切替わります（本部系・受付・Lessonは役割の権限で自動判定）。Legal/Moneyのセグメント個別権限は各アプリ側で管理します。
      </p>

      <AddStaff roles={roles} pending={pending} onRun={run} />
    </div>
  );
}

function AddStaff({
  roles,
  pending,
  onRun,
}: {
  roles: Role[];
  pending: boolean;
  onRun: (fd: FormData, fn: (f: FormData) => Promise<{ error?: string }>, id: string, ok: string) => void;
}) {
  const [show, setShow] = useState(false);
  if (!show)
    return (
      <button className={`${btnGhostCls} self-start text-sm`} onClick={() => setShow(true)}>
        ＋ スタッフを追加
      </button>
    );
  return (
    <form
      action={(fd) => onRun(fd, createStaff, "__add__", "スタッフを追加しました")}
      className="grid grid-cols-2 gap-2 rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3 text-sm md:grid-cols-3"
    >
      <input name="name" placeholder="氏名 *" className={inputCls} required />
      <input name="name_kana" placeholder="フリガナ" className={inputCls} />
      <input name="position" placeholder="役職（任意）" className={inputCls} />
      <input name="login_id" placeholder="ログインID（英数字）*" className={inputCls} required />
      <input name="password" type="text" placeholder="初期パスワード（8文字以上）*" autoComplete="off" className={inputCls} required />
      <select name="employment_type" defaultValue="fulltime" className={inputCls}>
        {EMP.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select name="role_id" defaultValue="" className={inputCls} required>
        <option value="" disabled>役割 *</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <div className="col-span-2 flex gap-2 md:col-span-3">
        <button className={btnCls} disabled={pending}>追加する</button>
        <button type="button" className={btnGhostCls} onClick={() => setShow(false)}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
