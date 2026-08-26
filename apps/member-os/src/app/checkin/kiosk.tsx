"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Bay = { id: string; name: string };
type Ok = {
  ok: true; checkinId: string; memberNo: string; name: string; planName: string | null;
  bayId: string | null; bayName: string | null; startTime: string | null; endTime: string | null;
  greeting: string[]; repeat: boolean;
};
type Ng = { ok: false; reason: string; message: string };
type Result = Ok | Ng;

const RESET_MS = 8000;

/**
 * 受付チェックイン画面（#154 / 構想 §5）
 *
 * この画面は **お客様側を向いている**。スタッフのメールや他のお客様の情報は出さない。
 * 出すのは 氏名・プラン・打席・声かけカード まで（生年月日や住所は出さない）。
 *
 * リーダーは USB HIDキーボードなので、画面側は「入力欄にフォーカスを当てておく」だけでよい。
 * フォーカスが外れると読み取りが迷子になるので、blur とクリックのたびに取り戻す。
 */
export function CheckinKiosk({ bays }: { bays: Bay[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; member_no: string; name: string; phone: string | null }>>([]);

  const focus = useCallback(() => {
    if (!manual) inputRef.current?.focus();
  }, [manual]);

  useEffect(() => {
    focus();
    const id = setInterval(focus, 1500); // 何かの拍子に外れても必ず戻す
    return () => clearInterval(id);
  }, [focus]);

  // 結果は数秒で消して待機画面に戻す（次のお客様に前の人の名前を見せない）
  useEffect(() => {
    if (!result) return;
    const id = setTimeout(() => { setResult(null); focus(); }, RESET_MS);
    return () => clearTimeout(id);
  }, [result, focus]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/checkin/api", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return (await res.json()) as Result;
  };

  const onScan = async (raw: string) => {
    const token = raw.trim();
    if (!token || busy) return;
    setBusy(true);
    try {
      const r = await post({ action: "scan", token });
      // 形式違い（商品バーコード等）は画面を汚さずに捨てる
      if (!r.ok && r.reason === "invalid") return;
      setResult(r);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const search = async (value: string) => {
    setQ(value);
    if (value.trim().length < 1) { setRows([]); return; }
    const res = await fetch("/checkin/api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search", q: value }),
    });
    const j = (await res.json()) as { rows?: typeof rows };
    setRows(j.rows ?? []);
  };

  const manualCheckIn = async (memberId: string) => {
    setBusy(true);
    try {
      setResult(await post({ action: "manual", memberId }));
      setManual(false); setQ(""); setRows([]);
    } finally { setBusy(false); }
  };

  const setBay = async (bayId: string) => {
    if (!result?.ok || !result.checkinId) return;
    await fetch("/checkin/api", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign", checkinId: result.checkinId, bayId }),
    });
    const bay = bays.find((b) => b.id === bayId);
    setResult({ ...result, bayId, bayName: bay?.name ?? null });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-8" onClick={focus}>
      {/* リーダーが打ち込む先。見えている必要はないが、画面外に置くとブラウザがフォーカスを外す */}
      <input
        ref={inputRef}
        type="text"
        inputMode="none"
        autoComplete="off"
        className="absolute h-px w-px opacity-0"
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void onScan((e.target as HTMLInputElement).value); }
        }}
      />

      {!result && !manual && (
        <div className="text-center">
          <p className="text-sm tracking-[0.4em] text-(--color-gold)">FRANK GOLF</p>
          <h1 className="mt-4 text-5xl font-bold tracking-wide">会員証をかざしてください</h1>
          <p className="mt-4 text-lg text-(--color-dim)">スマホのマイページからQRコードを表示し、読み取り機にかざしてください</p>
          {busy && <p className="mt-6 text-sm text-(--color-dim)">確認しています…</p>}
        </div>
      )}

      {result?.ok && (
        <div className="w-full max-w-2xl text-center">
          <p className="text-2xl font-semibold text-(--color-accent)">
            {result.repeat ? "すでにチェックイン済みです" : "✓ チェックインしました"}
          </p>
          <h1 className="mt-3 text-6xl font-bold tracking-wide">{result.name} 様</h1>
          <p className="mt-2 text-lg text-(--color-dim)">
            {result.memberNo}{result.planName ? ` ／ ${result.planName}` : ""}
          </p>

          <div className="mt-8 rounded-2xl border border-(--color-line) bg-(--color-panel) px-8 py-6">
            {result.bayName ? (
              <>
                <p className="text-5xl font-bold tracking-wide">{result.bayName}</p>
                {result.startTime && <p className="mt-2 text-xl text-(--color-dim)">{result.startTime} - {result.endTime}</p>}
              </>
            ) : (
              <>
                <p className="text-lg text-(--color-dim)">打席が決まっていません。スタッフが選んでください</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {bays.map((b) => (
                    <button key={b.id} onClick={() => void setBay(b.id)}
                      className="rounded-lg border border-(--color-line) bg-white px-4 py-2 text-base hover:bg-(--color-panel-2)">
                      {b.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {result.greeting.length > 0 && (
            // 声かけカード: スタッフが名前を呼んで一言かけるためのネタ（退会予防に一番効く）
            <ul className="mt-5 space-y-1 text-base text-(--color-dim)">
              {result.greeting.map((g) => <li key={g}>{g}</li>)}
            </ul>
          )}
        </div>
      )}

      {result && !result.ok && (
        <div className="text-center">
          <h1 className="text-4xl font-bold text-(--color-warn)">{result.message}</h1>
          <p className="mt-4 text-lg text-(--color-dim)">スタッフにお声がけください</p>
        </div>
      )}

      {manual && (
        <div className="w-full max-w-xl">
          <h2 className="mb-3 text-lg font-semibold">手動チェックイン</h2>
          <input
            autoFocus value={q} onChange={(e) => void search(e.target.value)}
            placeholder="お名前・カナ・会員番号・電話番号"
            className="w-full rounded-lg border border-(--color-line) bg-white px-4 py-3 text-lg focus:border-accent focus:outline-none"
          />
          <div className="mt-3 space-y-1.5">
            {rows.map((r) => (
              <button key={r.id} onClick={() => void manualCheckIn(r.id)}
                className="flex w-full items-center justify-between rounded-lg border border-(--color-line) bg-white px-4 py-3 text-left hover:bg-(--color-panel-2)">
                <span className="font-medium">{r.name}</span>
                <span className="text-sm text-(--color-dim)">{r.member_no}</span>
              </button>
            ))}
            {q && rows.length === 0 && <p className="py-4 text-center text-sm text-(--color-dim)">見つかりませんでした</p>}
          </div>
          <button onClick={() => { setManual(false); setQ(""); setRows([]); }}
            className="mt-4 text-sm text-(--color-dim) underline underline-offset-4">閉じる</button>
        </div>
      )}

      {!manual && (
        <>
          <button onClick={() => setManual(true)}
            className="fixed bottom-5 right-6 text-sm text-(--color-dim) underline underline-offset-4">
            QRが読めないとき
          </button>
          {/* 設置時と設定確認のための出口。お客様側を向いている画面なので目立たせない */}
          <a href="/orders" className="fixed bottom-5 left-6 text-xs text-(--color-dim)/50">受付へ戻る</a>
        </>
      )}
    </div>
  );
}
