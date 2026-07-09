"use client";

import { useFormState } from "react-dom";
import { loginAction } from "../actions";

const initial = { error: null };

export default function LoginPage() {
  const [state, formAction] = useFormState(loginAction, initial);
  return (
    <div className="authwrap">
      <form action={formAction} className="authcard">
        <div className="brand" style={{ color: "#1c2430", padding: "0 0 4px" }}>
          Sales OS
          <small style={{ color: "#6b7684" }}>営業サポートシステム</small>
        </div>
        <p className="muted small mb">ログインしてください</p>
        {state?.error && <div className="err">{state.error}</div>}
        <label>ID（またはメールアドレス）</label>
        <input name="email" type="text" placeholder="fukuhara" autoComplete="username" />
        <label>パスワード</label>
        <input name="password" type="password" autoComplete="current-password" />
        <button className="btn mt" style={{ width: "100%", justifyContent: "center" }}>ログイン</button>
      </form>
    </div>
  );
}
