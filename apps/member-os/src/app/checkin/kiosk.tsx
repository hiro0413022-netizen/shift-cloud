"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHECKIN_TOKEN_ALPHABET, CHECKIN_TOKEN_LENGTH } from "@yozan/core/frank-token";

type Bay = { id: string; name: string };
type Ok = {
  ok: true; checkinId: string; memberNo: string; name: string; planName: string | null;
  bayId: string | null; bayName: string | null; startTime: string | null; endTime: string | null;
  greeting: string[]; repeat: boolean;
};
type Ng = { ok: false; reason: string; message: string };
type Result = Ok | Ng;
type Diag = { raw: string; len: number; ms: number; end: "enter" | "idle"; reason: string; hint: string };

const RESET_MS = 8000;

/**
 * リーダーが打ち終わってからこれだけ静かなら、Enter が来なくても送る（#162）。
 * HIDリーダーは1文字を数ミリ秒間隔で打ち込むので、140ms 空いたら「打ち終わった」と見てよい。
 * Tera 9200 の Suffix=Enter が未設定のままでも動かすための保険。
 * 設定してあれば Enter 側が先に飛ぶので、この保険は出番がない。
 */
const SCAN_IDLE_MS = 140;
const SCAN_MIN_LEN = 6;

function hintFor(raw: string, r: Result): string {
  if (r.ok) return "OK（チェックイン成立）";
  if (r.reason !== "invalid") return r.message;
  // サーバ側 normalizeCheckinScan と同じ正規化をしてから見る（小文字と空白は救済される）
  const s = raw.replace(/[\s\u3000]+/g, "").toUpperCase();
  const bad = Array.from(new Set(Array.from(s).filter((c) => !CHECKIN_TOKEN_ALPHABET.includes(c))));
  if (bad.length > 0) {
    return `会員証QRに無い文字が混ざっています（${bad.slice(0, 8).join("")}）。リーダーのキーボード配列が日本語になっている可能性`;
  }
  if (s.length !== CHECKIN_TOKEN_LENGTH) {
    return `${s.length}文字（正しくは${CHECKIN_TOKEN_LENGTH}文字）。読み取り途中で送信された可能性`;
  }
  return "会員証QRではありません（商品バーコード等）。これは無視されます";
}

/**
 * 受付チェックイン画面（#154 / 構想 §5）
 *
 * この画面は **お客様側を向いている**。スタッフのメールや他のお客様の情報は出さない。
 * 出すのは 氏名・プラン・打席・声かけカード まで（生年月日や住所は出さない）。
 *
 * 読み取りの受け方（#162 で変更）:
 *   リーダーは USB HIDキーボードなので、以前は「隠し入力欄にフォーカスを当てて Enter を待つ」形だった。
 *   これは (1) フォーカスが外れると無反応 (2) Suffix=Enter 未設定だと無反応 の2つで沈黙する。
 *   設置当日にどちらなのか切り分けられないのが致命的だったので、
 *   window の keydown を直接拾い、Enter が来なくても打ち終わりで送る形にした。
 *   ?debug=1 を付けると、読めた生文字列と却下理由が画面下に出る（設置と設定確認用）。
 */
export function CheckinKiosk({ bays }: { bays: Bay[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Array<{ id: string; member_no: string; name: string; phone: string | null }>>([]);

  const [debug, setDebug] = useState(false);
  const [live, setLive] = useState("");
  const [diag, setDiag] = useState<Diag | null>(null);

  // window のリスナーからは state が古く見えるので、判定に使うものは ref にも置く
  const busyRef = useRef(false);
  const manualRef = useRef(false);
  const debugRef = useRef(false);
  const bufRef = useRef("");
  const t0Ref = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { manualRef.current = manual; }, [manual]);

  useEffect(() => {
    const on = new URLSearchParams(window.location.search).get("debug") === "1";
    debugRef.current = on;
    setDebug(on);
  }, []);

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

  const onScan = useCallback(async (raw: string, end: "enter" | "idle", ms: number) => {
    const token = raw.trim();
    if (!token || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await post({ action: "scan", token });
      if (debugRef.current) {
        setDiag({ raw: token, len: token.length, ms, end, reason: r.ok ? "ok" : r.reason, hint: hintFor(token, r) });
      }
      // 形式違い（商品バーコード等）は画面を汚さずに捨てる
      if (!r.ok && r.reason === "invalid") return;
      setResult(r);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  // リーダーの打ち込みを window で受ける（フォーカスが外れていても拾える）
  useEffect(() => {
    const flush = (end: "enter" | "idle") => {
      const raw = bufRef.current;
      const ms = t0Ref.current ? Date.now() - t0Ref.current : 0;
      bufRef.current = "";
      t0Ref.current = 0;
      if (debugRef.current) setLive("");
      if (raw.length >= SCAN_MIN_LEN) void onScan(raw, end, ms);
    };

    const onKey = (e: KeyboardEvent) => {
      if (manualRef.current) return; // 手動チェックインの検索中は普通の入力
      const el = e.target as HTMLElement | null;
      if (el && el !== inputRef.current && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

      if (e.key === "Enter") {
        if (timerRef.current) clearTimeout(timerRef.current);
        flush("enter");
        return;
      }
      if (e.key.length !== 1) return; // Shift・矢印などは無視

      if (!bufRef.current) t0Ref.current = Date.now();
      bufRef.current += e.key;
      if (debugRef.current) setLive(bufRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flush("idle"), SCAN_IDLE_MS);
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onScan]);

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
      {/* 打ち込み先の受け皿。読み取りは window で拾うので、ここは文字を溜めない（readOnly）。
          それでもフォーカスを当てておくのは、ブラウザのショートカット（Firefoxのクイック検索等）に
          文字を食われないようにするため。 */}
      <input
        ref={inputRef}
        type="text"
        readOnly
        inputMode="none"
        autoComplete="off"
        tabIndex={-1}
        aria-hidden
        className="absolute h-px w-px opacity-0"
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

      {debug && (
        // 設置・設定確認用。お客様側を向く画面なので ?debug=1 のときだけ出す
        <div className="fixed inset-x-0 bottom-0 border-t border-(--color-line) bg-black/85 px-5 py-3 text-left font-mono text-xs leading-relaxed text-white">
          <p className="text-(--color-gold)">診断モード（URLから ?debug=1 を外すと消えます）</p>
          <p className="mt-1">入力中: {live || "（待機中）"}</p>
          {diag ? (
            <>
              <p className="mt-1">
                受信: {diag.raw} ／ {diag.len}文字 ／ {diag.ms}ms ／ 終端=
                {diag.end === "enter" ? "Enter あり" : "Enter なし（打ち終わりで自動送信）"} ／ 結果={diag.reason}
              </p>
              <p className="mt-0.5 text-(--color-gold)">→ {diag.hint}</p>
            </>
          ) : (
            <p className="mt-1">まだ1件も読み取っていません。1文字も出ないときはリーダーがPCに認識されていません</p>
          )}
        </div>
      )}
    </div>
  );
}
