"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { OnlineMember, ThreadItem, Video, Template } from "@/lib/online/data";
import { pendingIncoming, waitInfo, waitLabel, rankVideos, videoBlock, DIVIDER, type ReplyOptions } from "@/lib/online/reply";
import { Avatar, AutoTextarea, PlanBadge, Toast, useToast, copyText, pasteText, useSpeech, draftStore, fmtDateTime } from "./ui";
import { generateReply, rewriteReply, markSent, saveMember, loadOlder, addIncoming } from "./online-actions";

type Saved = { incoming: string; memo: string; draft: string; replyId: string | null; options: ReplyOptions; at: number };

const EMOJI = ["😊", "👍", "👏", "💦", "🙇‍♀️", "✨", "⛳️", "🤔", "👌", "☺️"];
const REWRITES = ["もっと短く", "やわらかく", "もっと具体的に", "褒めを増やして", "箇条書きで見やすく"];

export default function Workspace({
  member: initialMember,
  thread: initialThread,
  videos,
  templates,
  aiReady,
}: {
  member: OnlineMember;
  thread: ThreadItem[];
  videos: Video[];
  templates: Template[];
  aiReady: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [member, setMember] = useState(initialMember);
  const [thread, setThread] = useState(initialThread);
  const [tab, setTab] = useState<"compose" | "thread" | "profile">("compose");

  const pending = useMemo(() => pendingIncoming(thread), [thread]);
  const wait = waitInfo(member.lastInAt, member.lastOutAt);

  /* ---------- 返信づくりの状態（端末に自動保存） ---------- */
  const key = `rr-draft:${member.id}`;
  const [incoming, setIncoming] = useState("");
  const [memo, setMemo] = useState("");
  const [draft, setDraft] = useState("");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [options, setOptions] = useState<ReplyOptions>({ length: "normal", askFeeling: false });
  const [history, setHistory] = useState<string[]>([]);
  const [focusIdea, setFocusIdea] = useState<string[]>([]);
  const [useFocusIdea, setUseFocusIdea] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [sheet, setSheet] = useState<null | "video" | "template">(null);
  const [copied, setCopied] = useState(false);
  const [busy, startBusy] = useTransition();
  const [busyLabel, setBusyLabel] = useState("");
  const loaded = useRef(false);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const saved = draftStore.get<Saved>(key);
    const pasted = draftStore.get<string>(`rr-paste:${member.id}`);
    draftStore.del(`rr-paste:${member.id}`);
    if (saved && Date.now() - saved.at < 3 * 24 * 3600 * 1000) {
      setIncoming(pasted ?? saved.incoming);
      setMemo(saved.memo);
      setDraft(saved.draft);
      setReplyId(saved.replyId);
      setOptions(saved.options ?? { length: "normal" });
    } else {
      setIncoming(pasted ?? pending.text);
      setOptions((o) => ({ ...o, apology: wait.waiting && wait.hours >= 24 }));
    }
    loaded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      if (!incoming && !memo && !draft) draftStore.del(key);
      else draftStore.set(key, { incoming, memo, draft, replyId, options, at: Date.now() } satisfies Saved);
    }, 400);
    return () => clearTimeout(t);
  }, [incoming, memo, draft, replyId, options, key]);

  const setDraftWithHistory = (next: string) => {
    setHistory((h) => (draft ? [...h.slice(-9), draft] : h));
    setDraft(next);
    setCopied(false);
  };

  const speech = useSpeech(useCallback((t: string) => setMemo((m) => (m ? `${m}\n${t}` : t)), []));

  /* ---------- 操作 ---------- */
  const generate = () => {
    setBusyLabel("返信文をつくっています…");
    startBusy(async () => {
      const r = await generateReply({ memberId: member.id, incoming, memo, options });
      if (!r.ok) return toast.show(r.error);
      setDraftWithHistory(r.reply);
      setReplyId(r.replyId);
      setFocusIdea(r.focus);
      setUseFocusIdea(false);
      setAiNote(r.aiUsed ? null : "AIが使えなかったため、メモから下書きを組み立てました。自由に直してください。");
      setTimeout(() => draftRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    });
  };

  const rewrite = (how: string) => {
    if (!how.trim()) return;
    setBusyLabel("書き直しています…");
    startBusy(async () => {
      const r = await rewriteReply({ text: draft, instruction: how });
      if (!r.ok) return toast.show(r.error);
      setDraftWithHistory(r.reply);
      setInstruction("");
    });
  };

  const insert = (text: string, block = false) => {
    const el = draftRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    let piece = text;
    if (block) {
      const before = draft.slice(0, start);
      const after = draft.slice(end);
      piece = `${before && !before.endsWith("\n") ? "\n" : ""}${text}${after && !after.startsWith("\n") ? "\n" : ""}`;
    }
    const next = draft.slice(0, start) + piece + draft.slice(end);
    setDraftWithHistory(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + piece.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const doCopy = async () => {
    const ok = await copyText(draft);
    setCopied(ok);
    toast.show(ok ? "コピーしました。LINEに貼り付けてください" : "コピーできませんでした。長押しで選択してください");
  };

  const sent = () => {
    setBusyLabel("履歴に残しています…");
    startBusy(async () => {
      const r = await markSent({
        memberId: member.id,
        replyId,
        finalBody: draft,
        incoming: incoming.trim() && incoming.trim() !== pending.text.trim() ? incoming : "",
        focus: useFocusIdea ? focusIdea : null,
      });
      if (!r.ok) return toast.show(r.error);
      setThread((t) => [...t, r.message]);
      if (useFocusIdea) setMember((m) => ({ ...m, focus: focusIdea }));
      setMember((m) => ({ ...m, lastOutAt: r.message.sentAt }));
      setIncoming("");
      setMemo("");
      setDraft("");
      setHistory([]);
      setReplyId(null);
      setFocusIdea([]);
      setCopied(false);
      draftStore.del(key);
      toast.show("送った返信を履歴に残しました");
      router.refresh();
    });
  };

  const opt = (k: keyof ReplyOptions) => setOptions((o) => ({ ...o, [k]: !o[k] }));

  /* ---------- 画面 ---------- */
  const composer = (
    <div className="space-y-4">
      {/* STEP 1 */}
      <Step no={1} en="Message" title="届いたメッセージ">
        {(pending.videos > 0 || pending.photos > 0) && (
          <div className="mb-2 flex flex-wrap gap-1.5 text-[12px]">
            {pending.videos > 0 && <span className="rounded-full bg-(--rr-gold-soft) px-2.5 py-1 text-[#8a6d40]">🎬 動画 {pending.videos}本</span>}
            {pending.photos > 0 && <span className="rounded-full bg-(--rr-gold-soft) px-2.5 py-1 text-[#8a6d40]">📷 写真 {pending.photos}枚</span>}
            <span className="py-1 text-(--color-faint)">がLINEに届いています（{fmtDateTime(pending.since)}〜）</span>
          </div>
        )}
        <AutoTextarea
          className="rr-input"
          minRows={3}
          placeholder="会員さんのメッセージを貼り付け（動画だけのときは空でOK）"
          value={incoming}
          onChange={(e) => setIncoming(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            className="rr-btn-ghost !px-3 !py-1.5 text-[12px]"
            onClick={async () => {
              const t = await pasteText();
              if (t) setIncoming((v) => (v ? `${v}\n\n${t}` : t));
              else toast.show("長押しして「ペースト」を選んでください");
            }}
          >
            📋 貼り付け
          </button>
          {incoming && (
            <button className="rr-btn-ghost !px-3 !py-1.5 text-[12px] text-(--color-faint)" onClick={() => setIncoming("")}>
              消す
            </button>
          )}
        </div>
        {incoming.trim() && incoming.trim() !== pending.text.trim() && (
          <button
            className="mt-2 text-[12px] text-(--color-dim) underline decoration-dotted underline-offset-4"
            onClick={() =>
              startBusy(async () => {
                const r = await addIncoming({ memberId: member.id, text: incoming });
                if (!r.ok) return toast.show(r.error);
                setThread((t) => [...t, r.message]);
                setMember((m) => ({ ...m, lastInAt: r.message.sentAt }));
                toast.show("トーク履歴に追加しました");
              })
            }
          >
            返信は後で。いまはトーク履歴にだけ残す
          </button>
        )}
      </Step>

      {/* STEP 2 */}
      <Step
        no={2}
        en="Check"
        title="動画を見て気づいたこと"
        hint="箇条書きでOK。ここに書いたことだけが指摘になります"
      >
        <AutoTextarea
          className="rr-input"
          minRows={4}
          placeholder={"例）\n・アドレス良い、前傾OK\n・トップで左膝が前に出る→右膝方向へ\n・次はペットボトルドリル"}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        {speech.supported && (
          <button
            onClick={speech.toggle}
            className={
              "mt-2 inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-semibold " +
              (speech.on ? "animate-pulse bg-(--rr-wait) text-white" : "bg-(--rr-ink) text-white")
            }
          >
            🎙 {speech.on ? "聞き取り中…タップで止める" : "話して入力"}
          </button>
        )}
        {member.focus.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-(--color-faint)">いまの課題から：</span>
            {member.focus.map((f) => (
              <button
                key={f}
                className="rounded-full bg-(--rr-gold-soft) px-2.5 py-1 text-[12px] text-[#8a6d40] hover:brightness-95"
                onClick={() => setMemo((m) => `${m ? m + "\n" : ""}・${f}：`)}
              >
                ＋ {f}
              </button>
            ))}
          </div>
        )}
      </Step>

      {/* STEP 3 */}
      <Step no={3} en="Tone" title="返信の方向">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-(--color-line) bg-white p-0.5">
            {(
              [
                ["short", "短め"],
                ["normal", "ふつう"],
                ["long", "しっかり"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                className={"rounded-full px-3 py-1 text-[13px] " + (options.length === k ? "bg-(--rr-ink) text-white" : "text-(--color-dim)")}
                onClick={() => setOptions((o) => ({ ...o, length: k }))}
              >
                {l}
              </button>
            ))}
          </div>
          <button className="rr-chip" data-on={!!options.praise} onClick={() => opt("praise")}>👏 褒め多め</button>
          <button className="rr-chip" data-on={!!options.keepGoing} onClick={() => opt("keepGoing")}>🔁 継続を促す</button>
          <button className="rr-chip" data-on={!!options.nextStep} onClick={() => opt("nextStep")}>➡ 次の課題へ</button>
          <button className="rr-chip" data-on={!!options.askFeeling} onClick={() => opt("askFeeling")}>❓ 感覚を聞く</button>
          <button className="rr-chip" data-on={!!options.apology} onClick={() => opt("apology")}>🙇‍♀️ 遅れのお詫び</button>
        </div>
        <input
          className="rr-input mt-2 !py-2 text-sm"
          placeholder="ほかに伝えたいこと（任意）例：ラウンドの結果を褒める"
          value={options.extra ?? ""}
          onChange={(e) => setOptions((o) => ({ ...o, extra: e.target.value }))}
        />
        <button className="rr-btn-ink mt-3 w-full py-3.5 text-[15px]" disabled={busy} onClick={generate}>
          {busy && busyLabel.startsWith("返信") ? (
            <span className="flex items-center gap-2"><Spinner /> {busyLabel}</span>
          ) : draft ? (
            "↻ もう一度つくる"
          ) : (
            "✦ 返信文をつくる"
          )}
        </button>
        {!aiReady && <p className="mt-2 text-[11px] text-(--color-faint)">※ AIの設定前のため、メモをもとにした簡易な下書きになります</p>}
      </Step>

      {/* 下書き */}
      {/* overflow-hidden を付けない（付けると下の操作バーの sticky がカードの中で効いて文字に被る） */}
      <div className="rr-card">
        <div className="flex items-center gap-2 rounded-t-2xl border-b border-(--color-line) bg-(--color-panel-2) px-4 py-2.5">
          <span className="rr-en text-lg leading-none text-(--rr-ink)">Reply</span>
          <span className="text-[12px] text-(--color-dim)">返信文（自由に直せます）</span>
          <span className={"ml-auto text-[11px] " + (draft.length > 500 ? "text-(--rr-wait)" : "text-(--color-faint)")}>{draft.length}字</span>
        </div>

        {/* 道具 */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-(--color-line) px-3 py-2 md:flex-wrap">
          <Tool onClick={() => insert(DIVIDER, true)}>┈ 区切り線</Tool>
          <Tool onClick={() => setSheet("video")}>🎬 動画</Tool>
          <Tool onClick={() => setSheet("template")}>💬 定型文</Tool>
          <span className="mx-1 h-5 w-px bg-(--color-line)" />
          {EMOJI.map((e) => (
            <button key={e} className="rounded-md px-1 text-lg leading-none hover:bg-(--rr-gold-soft)" onClick={() => insert(e)}>
              {e}
            </button>
          ))}
          <span className="ml-auto pl-2" />
          <Tool disabled={!history.length} onClick={() => {
            const prev = history[history.length - 1];
            setHistory((h) => h.slice(0, -1));
            setDraft(prev ?? "");
          }}>↶ 戻す</Tool>
        </div>

        <AutoTextarea
          inputRef={draftRef}
          minRows={10}
          className="block w-full bg-white px-4 py-3.5 text-[15px] leading-[1.85] outline-none placeholder:text-(--color-faint)"
          placeholder="「返信文をつくる」を押すと、ここに下書きが出ます。直接書いてもOKです。"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setCopied(false);
          }}
        />
        {aiNote && <p className="px-4 pb-2 text-[11px] text-(--rr-wait)">{aiNote}</p>}

        {draft && (
          <div className="border-t border-(--color-line) px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-(--color-faint)">AIで直す：</span>
              {REWRITES.map((r) => (
                <button key={r} className="rr-chip !py-1 text-[12px]" disabled={busy} onClick={() => rewrite(r)}>
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="rr-input !py-2 text-sm"
                placeholder="直し方を書く（例：最初にラウンドのねぎらいを入れて）"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && rewrite(instruction)}
              />
              <button className="rr-btn-ghost shrink-0" disabled={busy || !instruction.trim()} onClick={() => rewrite(instruction)}>
                直す
              </button>
            </div>
            {busy && busyLabel.startsWith("書き直") && <p className="mt-2 flex items-center gap-2 text-[12px] text-(--color-dim)"><Spinner dark /> {busyLabel}</p>}
          </div>
        )}

        {focusIdea.length > 0 && (
          <label className="flex cursor-pointer items-start gap-2 border-t border-(--color-line) bg-(--rr-gold-soft)/60 px-4 py-2.5 text-[12px]">
            <input type="checkbox" className="mt-0.5 accent-[#313131]" checked={useFocusIdea} onChange={(e) => setUseFocusIdea(e.target.checked)} />
            <span>
              <span className="font-semibold text-(--rr-ink)">いまの課題を更新する：</span>
              <span className="text-[#8a6d40]">{focusIdea.join(" ／ ")}</span>
            </span>
          </label>
        )}

        <div className={(draft.trim() ? "sticky " : "") + "bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 grid grid-cols-2 gap-2 rounded-b-2xl border-t border-(--color-line) bg-white/95 p-3 backdrop-blur lg:bottom-0"}>
          <button className="rr-btn-line py-3.5 text-[15px]" disabled={!draft.trim()} onClick={doCopy}>
            {copied ? "✓ コピー済み" : "コピーする"}
          </button>
          <button className="rr-btn-ink py-3.5 text-[15px]" disabled={!draft.trim() || busy} onClick={sent}>
            LINEで送った ✓
          </button>
        </div>
      </div>
      <p className="px-1 text-[11px] leading-relaxed text-(--color-faint)">
        このシステムからLINEへは送信しません。「コピーする」→ LINEに貼って送信 →「LINEで送った」で履歴と課題が残ります。書きかけはこの端末に自動で保存されます。
      </p>
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/online" className="flex h-9 w-9 items-center justify-center rounded-full border border-(--color-line) bg-white text-(--color-dim) hover:text-(--rr-ink)" aria-label="受信箱へ">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </Link>
        <Avatar name={member.name} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {member.mark && <span>{member.mark}</span>}
            <h1 className="truncate text-xl font-bold">{member.name}</h1>
            <PlanBadge plan={member.plan} />
          </div>
          <div className="text-[12px] text-(--color-dim)">
            {wait.waiting ? (
              <span className="font-semibold text-(--rr-wait)">返信待ち {waitLabel(wait.hours)}</span>
            ) : (
              <span>最終返信 {fmtDateTime(member.lastOutAt) || "—"}</span>
            )}
            {member.startedOn && <span className="ml-2">受講開始 {member.startedOn.replaceAll("-", "/")}</span>}
          </div>
        </div>
      </div>

      {/* スマホ: タブ */}
      <div className="mb-4 grid grid-cols-3 rounded-xl border border-(--color-line) bg-white p-1 lg:hidden">
        {(
          [
            ["compose", "返信をつくる"],
            ["thread", "トーク履歴"],
            ["profile", "会員メモ"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={"rounded-lg py-2 text-[13px] font-medium " + (tab === k ? "bg-(--rr-ink) text-white" : "text-(--color-dim)")} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className={"min-w-0 space-y-4 " + (tab === "compose" ? "hidden lg:block" : "")}>
          <div className={tab === "thread" ? "hidden lg:block" : ""}>
            <ProfileCard member={member} onSaved={(m) => setMember(m)} toast={toast.show} />
          </div>
          <div className={tab === "profile" ? "hidden lg:block" : ""}>
            <ThreadPanel
              memberId={member.id}
              thread={thread}
              setThread={setThread}
              onQuote={(t) => {
                setIncoming((v) => (v ? `${v}\n\n${t}` : t));
                setTab("compose");
                toast.show("「届いたメッセージ」に入れました");
              }}
              toast={toast.show}
            />
          </div>
        </div>
        <div className={"min-w-0 " + (tab === "compose" ? "" : "hidden lg:block")}>{composer}</div>
      </div>

      {sheet === "video" && (
        <VideoSheet
          videos={videos}
          query={memo}
          secondary={incoming}
          onClose={() => setSheet(null)}
          onPick={(v) => {
            insert(videoBlock(v), true);
            setSheet(null);
          }}
        />
      )}
      {sheet === "template" && (
        <TemplateSheet
          templates={templates}
          onClose={() => setSheet(null)}
          onPick={(t) => {
            insert(t.body, true);
            setSheet(null);
          }}
        />
      )}
      <Toast msg={toast.msg} />
    </div>
  );
}

/* ================= 部品 ================= */

function Step({ no, en, title, hint, children }: { no: number; en: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rr-card p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-(--rr-ink) text-[12px] font-bold text-white">{no}</span>
        <span className="rr-en text-[17px] italic leading-none text-(--rr-gold)">{en}</span>
        <span className="text-[14px] font-semibold">{title}</span>
      </div>
      {hint && <p className="-mt-1 mb-2 text-[11px] text-(--color-faint)">{hint}</p>}
      {children}
    </section>
  );
}

function Tool({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-(--color-line) bg-white px-2.5 py-1 text-[12px] text-(--color-txt) hover:border-(--rr-gold) disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Spinner({ dark }: { dark?: boolean }) {
  return <span className={"inline-block h-4 w-4 animate-spin rounded-full border-2 " + (dark ? "border-(--color-line) border-t-(--rr-ink)" : "border-white/30 border-t-white")} />;
}

function ProfileCard({ member, onSaved, toast }: { member: OnlineMember; onSaved: (m: OnlineMember) => void; toast: (m: string) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(member);
  const [focusText, setFocusText] = useState(member.focus.join("\n"));
  const [busy, start] = useTransition();
  useEffect(() => {
    setF(member);
    setFocusText(member.focus.join("\n"));
  }, [member]);

  const save = () =>
    start(async () => {
      const focus = focusText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const r = await saveMember({
        memberId: member.id, name: f.name, plan: f.plan, status: f.status, mark: f.mark,
        goal: f.goal, profile: f.profile, memo: f.memo, focus, startedOn: f.startedOn,
      });
      if (!r.ok) return toast(r.error);
      onSaved({ ...f, focus });
      setEdit(false);
      toast("会員メモを保存しました");
    });

  if (!edit)
    return (
      <div className="rr-card p-4">
        <div className="mb-2 flex items-center">
          <span className="rr-en text-lg leading-none">Profile</span>
          <span className="ml-2 text-[12px] text-(--color-dim)">会員メモ</span>
          <button className="ml-auto text-[12px] text-(--color-dim) underline decoration-dotted underline-offset-4" onClick={() => setEdit(true)}>
            編集
          </button>
        </div>
        <div className="mb-2">
          <div className="mb-1 text-[11px] text-(--color-faint)">いまの課題</div>
          {member.focus.length ? (
            <div className="flex flex-wrap gap-1.5">
              {member.focus.map((x, i) => (
                <span key={x} className="rounded-full bg-(--rr-gold-soft) px-2.5 py-1 text-[12px] text-[#8a6d40]">
                  {i + 1}. {x}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-(--color-faint)">まだありません（返信をつくると更新案が出ます）</p>
          )}
        </div>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-[13px]">
          <dt className="text-(--color-faint)">目標</dt>
          <dd>{member.goal || "—"}</dd>
          <dt className="text-(--color-faint)">プロフィール</dt>
          <dd className="whitespace-pre-wrap">{member.profile || "—"}</dd>
          <dt className="text-(--color-faint)">覚え書き</dt>
          <dd className="whitespace-pre-wrap">{member.memo || "—"}</dd>
        </dl>
      </div>
    );

  return (
    <div className="rr-card rr-pop space-y-2.5 p-4">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2">
          <span className="text-[11px] text-(--color-dim)">お名前</span>
          <input className="rr-input !py-2" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label>
          <span className="text-[11px] text-(--color-dim)">プラン</span>
          <select className="rr-input !py-2" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value as OnlineMember["plan"] })}>
            <option value="regular">レギュラー</option>
            <option value="premium">プレミアム</option>
            <option value="other">その他</option>
          </select>
        </label>
        <label>
          <span className="text-[11px] text-(--color-dim)">状態</span>
          <select className="rr-input !py-2" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OnlineMember["status"] })}>
            <option value="active">受講中</option>
            <option value="paused">休会</option>
            <option value="left">退会</option>
          </select>
        </label>
        <label>
          <span className="text-[11px] text-(--color-dim)">印（☆ ⚠️ など）</span>
          <input className="rr-input !py-2" value={f.mark ?? ""} onChange={(e) => setF({ ...f, mark: e.target.value })} />
        </label>
        <label>
          <span className="text-[11px] text-(--color-dim)">受講開始</span>
          <input type="date" className="rr-input !py-2" value={f.startedOn ?? ""} onChange={(e) => setF({ ...f, startedOn: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className="text-[11px] text-(--color-dim)">いまの課題（1行に1つ・最大5つ）</span>
        <textarea className="rr-input min-h-[84px]" value={focusText} onChange={(e) => setFocusText(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-[11px] text-(--color-dim)">目標</span>
        <input className="rr-input !py-2" placeholder="例：年内に100切り" value={f.goal ?? ""} onChange={(e) => setF({ ...f, goal: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-[11px] text-(--color-dim)">プロフィール（身長・練習環境・使用番手など）</span>
        <textarea className="rr-input min-h-[64px]" value={f.profile ?? ""} onChange={(e) => setF({ ...f, profile: e.target.value })} />
      </label>
      <label className="block">
        <span className="text-[11px] text-(--color-dim)">覚え書き（AIも参考にします）</span>
        <textarea className="rr-input min-h-[64px]" value={f.memo ?? ""} onChange={(e) => setF({ ...f, memo: e.target.value })} />
      </label>
      <div className="flex gap-2">
        <button className="rr-btn-ghost flex-1" onClick={() => setEdit(false)}>やめる</button>
        <button className="rr-btn-ink flex-1" disabled={busy} onClick={save}>保存</button>
      </div>
    </div>
  );
}

type Block =
  | { type: "day"; key: string; label: string }
  | { type: "media"; key: string; dir: "in" | "out"; videos: number; photos: number; stickers: number; at: string }
  | { type: "text"; key: string; item: ThreadItem };

function toBlocks(thread: ThreadItem[]): Block[] {
  const out: Block[] = [];
  let day = "";
  for (const m of thread) {
    if (m.kind === "unsent") continue;
    const d = fmtDateTime(m.sentAt).split(" ")[0];
    const y = new Date(new Date(m.sentAt).getTime() + 9 * 3600000).getUTCFullYear();
    if (d !== day) {
      day = d;
      out.push({ type: "day", key: `d-${m.id}`, label: `${y}/${d}` });
    }
    if (m.kind === "video" || m.kind === "photo" || m.kind === "sticker") {
      const last = out[out.length - 1];
      const dir = m.direction === "out" ? "out" : "in";
      if (last?.type === "media" && last.dir === dir) {
        if (m.kind === "video") last.videos++;
        else if (m.kind === "photo") last.photos++;
        else last.stickers++;
      } else {
        out.push({ type: "media", key: `m-${m.id}`, dir, videos: m.kind === "video" ? 1 : 0, photos: m.kind === "photo" ? 1 : 0, stickers: m.kind === "sticker" ? 1 : 0, at: m.sentAt });
      }
      continue;
    }
    out.push({ type: "text", key: m.id, item: m });
  }
  return out;
}

function ThreadPanel({
  memberId, thread, setThread, onQuote, toast,
}: {
  memberId: string;
  thread: ThreadItem[];
  setThread: (f: (t: ThreadItem[]) => ThreadItem[]) => void;
  onQuote: (t: string) => void;
  toast: (m: string) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [more, setMore] = useState(thread.length >= 80);
  const [busy, start] = useTransition();
  const blocks = useMemo(() => toBlocks(thread), [thread]);
  const lastId = thread[thread.length - 1]?.id;

  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  // スマホではタブで隠れた状態で描かれるので、見えた瞬間に一番下へ
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let wasHidden = el.clientHeight === 0;
    const ro = new ResizeObserver(() => {
      if (wasHidden && el.clientHeight > 0) el.scrollTop = el.scrollHeight;
      wasHidden = el.clientHeight === 0;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const older = () =>
    start(async () => {
      const first = thread[0];
      if (!first) return;
      const el = box.current;
      const prevH = el?.scrollHeight ?? 0;
      const r = await loadOlder({ memberId, before: first.sentAt });
      if (!r.ok) return toast(r.error);
      if (r.items.length < 80) setMore(false);
      setThread((t) => [...r.items, ...t]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevH;
      });
    });

  return (
    <div className="rr-card overflow-hidden">
      <div className="flex items-center border-b border-(--color-line) px-4 py-2.5">
        <span className="rr-en text-lg leading-none">Talk</span>
        <span className="ml-2 text-[12px] text-(--color-dim)">トーク履歴</span>
        <span className="ml-auto text-[11px] text-(--color-faint)">吹き出しをタップ → 返信欄へ</span>
      </div>
      <div ref={box} className="max-h-[62vh] space-y-2 overflow-y-auto bg-[#efece6] px-3 py-3 lg:max-h-[calc(100vh-260px)]">
        {more && (
          <div className="text-center">
            <button className="rounded-full bg-white px-3 py-1 text-[12px] text-(--color-dim) shadow-sm" disabled={busy} onClick={older}>
              {busy ? "読み込み中…" : "さらに前を表示"}
            </button>
          </div>
        )}
        {blocks.map((b) => {
          if (b.type === "day")
            return (
              <div key={b.key} className="py-1 text-center">
                <span className="rounded-full bg-black/10 px-2.5 py-0.5 text-[10px] text-(--color-dim)">{b.label}</span>
              </div>
            );
          if (b.type === "media") {
            const parts = [b.videos && `🎬 動画 ${b.videos}`, b.photos && `📷 写真 ${b.photos}`, b.stickers && `スタンプ ${b.stickers}`].filter(Boolean);
            return (
              <div key={b.key} className={"flex " + (b.dir === "out" ? "justify-end" : "justify-start")}>
                <span className="rounded-full border border-dashed border-black/15 bg-white/60 px-3 py-1 text-[11px] text-(--color-dim)">{parts.join(" ・ ")}</span>
              </div>
            );
          }
          const m = b.item;
          if (m.direction === "system")
            return (
              <div key={b.key} className="mx-auto max-w-[85%] rounded-xl bg-white/50 px-3 py-2 text-[11px] text-(--color-faint)">
                自動応答：{m.body.slice(0, 40)}…
              </div>
            );
          const out = m.direction === "out";
          return (
            <div key={b.key} className={"flex items-end gap-1.5 " + (out ? "flex-row-reverse" : "")}>
              <button
                type="button"
                onClick={() => !out && onQuote(m.body)}
                className={
                  "max-w-[82%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-left text-[13.5px] leading-relaxed " +
                  (out ? "rr-bubble-out cursor-default" : "rr-bubble-in hover:ring-2 hover:ring-(--rr-gold)/40")
                }
              >
                {linkify(m.body, out)}
              </button>
              <span className="shrink-0 pb-0.5 text-[10px] text-(--color-faint)">{fmtDateTime(m.sentAt).split(" ")[1]}</span>
            </div>
          );
        })}
        {!thread.length && <p className="py-10 text-center text-sm text-(--color-dim)">まだやり取りがありません</p>}
      </div>
    </div>
  );
}

function linkify(text: string, onDark: boolean) {
  const parts = text.split(/(https?:\/\/\S+)/g);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={"underline " + (onDark ? "text-[#e8d3ad]" : "text-[#8a6d40]")}>
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div className="sheet-up flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-(--color-line) px-5 py-3.5">
          <span className="font-semibold">{title}</span>
          <button className="ml-auto h-8 w-8 rounded-full bg-(--color-panel-2) text-(--color-dim)" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

function VideoSheet({ videos, query, secondary, onClose, onPick }: { videos: Video[]; query: string; secondary: string; onClose: () => void; onPick: (v: Video) => void }) {
  const [q, setQ] = useState("");
  const words = (q || "").split(/\s+/).filter(Boolean);
  const suggested = useMemo(() => {
    if (!query.trim() && !secondary.trim()) return videos;
    const order = rankVideos(videos.map((v) => ({ url: v.url, title: v.title, tags: v.tags, useCount: v.useCount })), query, videos.length, secondary);
    const idx = new Map(order.map((v, i) => [v.url, i]));
    return [...videos].sort((a, b) => (idx.get(a.url) ?? 0) - (idx.get(b.url) ?? 0));
  }, [videos, query]);
  const list = (words.length ? videos : suggested).filter((v) => words.every((w) => `${v.title} ${v.tags.join(" ")} ${v.note ?? ""}`.includes(w)));
  return (
    <Sheet title="🎬 動画を挿入" onClose={onClose}>
      <input autoFocus className="rr-input mb-3 !py-2" placeholder="タイトル・タグで探す（例：右足　フィニッシュ）" value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && (query.trim() || secondary.trim()) && <p className="mb-2 text-[11px] text-(--color-faint)">メモ・メッセージに近い順に並んでいます</p>}
      <ul className="space-y-1.5">
        {list.slice(0, 80).map((v) => (
          <li key={v.id}>
            <button className="w-full rounded-xl border border-(--color-line) p-3 text-left hover:border-(--rr-gold)" onClick={() => onPick(v)}>
              <div className="text-[13.5px] font-medium leading-snug">{v.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-(--color-faint)">
                <span>{v.url.replace("https://", "")}</span>
                <span>・{v.useCount}回使用</span>
                {v.tags.map((t) => (
                  <span key={t} className="rounded bg-(--rr-gold-soft) px-1.5 text-[#8a6d40]">{t}</span>
                ))}
              </div>
            </button>
          </li>
        ))}
        {!list.length && <li className="py-6 text-center text-sm text-(--color-dim)">見つかりません。「動画」タブから追加できます</li>}
      </ul>
    </Sheet>
  );
}

function TemplateSheet({ templates, onClose, onPick }: { templates: Template[]; onClose: () => void; onPick: (t: Template) => void }) {
  return (
    <Sheet title="💬 定型文を挿入" onClose={onClose}>
      <ul className="space-y-1.5">
        {templates.map((t) => (
          <li key={t.id}>
            <button className="w-full rounded-xl border border-(--color-line) p-3 text-left hover:border-(--rr-gold)" onClick={() => onPick(t)}>
              <div className="text-[13.5px] font-semibold">{t.title}</div>
              <div className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] text-(--color-dim)">{t.body}</div>
            </button>
          </li>
        ))}
        {!templates.length && <li className="py-6 text-center text-sm text-(--color-dim)">定型文がありません。「定型文」タブから追加できます</li>}
      </ul>
    </Sheet>
  );
}
