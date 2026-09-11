"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * 電子サイン（canvas手書き）。店頭タブレット入会 /join/[token] と Web入会 /join-web で共用（#129）。
 * 値は PNG の data URL。空文字=未記入。
 *
 * ── 「サインしていると画面が動く」対策（#234・2026-09-11 ユーザー指摘） ──
 * 以前は CSS の touch-action:none だけに頼っていた。iPad/iPhone の Safari ではそれだけだと
 *   ① 指を置いた瞬間やなぞり始めにページがスクロール／端でびよーんと跳ねる
 *   ② 漢字の「点」を素早く2回打つとダブルタップ拡大が効いて画面が寄る
 *   ③ 長押しで文字選択の虫めがねが出る
 *   ④ スクロールでアドレスバーが出入りすると resize が飛び、canvas を作り直して書いた線が消える
 * が起きていた。
 *   → canvas 上のタッチは passive:false のネイティブリスナーで preventDefault（①②③）
 *     （React の onTouchMove は passive 扱いで止められないので addEventListener を直接使う）
 *   → 作り直しは「枠の幅が変わったとき」だけ。変わっても線を覚えておいて描き直す（④）
 *   → 2本目の指（手のひら）は無視する
 */

type Pt = { x: number; y: number };

export function SignaturePad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointer = useRef<number | null>(null);
  const last = useRef<Pt | null>(null);
  /** 書いた線（CSSピクセル）。幅が変わったときに描き直すために持っておく */
  const strokes = useRef<Pt[][]>([]);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const styleCtx = (ctx: CanvasRenderingContext2D) => {
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    styleCtx(ctx);
    for (const s of strokes.current) {
      if (s.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.01, s[0].y); // 点だけの画（「、」など）
      for (let k = 1; k < s.length; k++) ctx.lineTo(s[k].x, s[k].y);
      ctx.stroke();
    }
  }, []);

  /** 枠の大きさに合わせて canvas を作り直す。幅が同じなら何もしない（アドレスバーの出入りでは消さない） */
  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const prev = sizeRef.current;
    if (Math.abs(prev.w - rect.width) < 1 && Math.abs(prev.h - rect.height) < 1) return;
    // 画面の回転などで幅が変わったときは、線を新しい幅に合わせて伸縮する
    if (prev.w > 0 && prev.h > 0) {
      const sx = rect.width / prev.w;
      const sy = rect.height / prev.h;
      strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * sx, y: p.y * sy })));
    }
    sizeRef.current = { w: rect.width, h: rect.height };
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
  }, [redraw]);

  useEffect(() => {
    fit();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fit()) : null;
    ro?.observe(canvas);
    window.addEventListener("orientationchange", fit);

    // ★ ここが「画面が動く」対策の本体。canvas の上ではブラウザにタッチを渡さない
    const block = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    canvas.addEventListener("touchstart", block, { passive: false });
    canvas.addEventListener("touchmove", block, { passive: false });
    canvas.addEventListener("touchend", block, { passive: false });
    // Safari の拡大ジェスチャー（2本指）も canvas の上では効かせない
    canvas.addEventListener("gesturestart", block as EventListener, { passive: false } as AddEventListenerOptions);

    return () => {
      ro?.disconnect();
      window.removeEventListener("orientationchange", fit);
      canvas.removeEventListener("touchstart", block);
      canvas.removeEventListener("touchmove", block);
      canvas.removeEventListener("touchend", block);
      canvas.removeEventListener("gesturestart", block as EventListener);
    };
  }, [fit]);

  // 親が value を空にしたら（やり直し等）線も消す
  useEffect(() => {
    if (value === "" && strokes.current.length > 0 && activePointer.current === null) {
      strokes.current = [];
      redraw();
    }
  }, [value, redraw]);

  const pos = (e: { clientX: number; clientY: number }): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== null) return; // 2本目の指・手のひらは無視
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 古いブラウザ */
    }
    fit();
    activePointer.current = e.pointerId;
    const p = pos(e);
    last.current = p;
    strokes.current.push([p]);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      // 点だけ打った場合も見えるようにする
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.01, p.y);
      ctx.stroke();
    }
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const stroke = strokes.current[strokes.current.length - 1];
    // 間引かれた途中の点も拾う（速く書いたときに線がカクカクしない）
    const native = e.nativeEvent as PointerEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [];
    const points = (events.length > 0 ? events : [native]).map(pos);
    for (const p of points) {
      if (ctx && last.current) {
        ctx.beginPath();
        ctx.moveTo(last.current.x, last.current.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      stroke?.push(p);
      last.current = p;
    }
  };

  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas) onChangeRef.current(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    onChangeRef.current("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          overscrollBehavior: "contain",
        }}
        className="block h-48 w-full touch-none select-none rounded-xl border border-dashed border-(--color-line) bg-(--color-panel-2) sm:h-56"
      />
      <div className="mt-1 flex justify-between text-xs text-(--color-dim)">
        <span>{value ? "署名を記入済み" : "上の枠内にご署名ください"}</span>
        <button type="button" onClick={clear} className="hover:text-(--color-txt)">消してやり直す</button>
      </div>
    </div>
  );
}
