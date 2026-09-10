import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import {
  DEFAULT_PERSONAL_SHEET_COLS,
  DEFAULT_TEAM_SHEET_COLS,
  getComp,
  listGroups,
  listParticipants,
  listPrizes,
  listReceipts,
  listScores,
  listTeams,
} from "@/lib/compe";
import { dateJa, yen } from "@/lib/format";
import { PrintToolbar } from "@/components/print-frame";
import { pageCss, THEMES } from "../page-size";
import { buildScoreRows, formatHcp, formatLabel, formatNet, isPeria } from "@yozan/core/compe-score";

type Props = {
  params: Promise<{ id: string; doc: string }>;
  searchParams: Promise<{ size?: string; orient?: string; theme?: string }>;
};

export default async function PrintPage({ params, searchParams }: Props) {
  const { id, doc } = await params;
  const sp = await searchParams;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();

  const size = sp.size ?? (doc === "scoresheet" ? "a3" : "a4");
  const orient = sp.orient ?? (doc === "scoresheet" ? "landscape" : "portrait");
  const theme = THEMES[sp.theme ?? "green"] ?? THEMES.green;
  const withTheme = doc === "board" || doc === "teamboard" || doc === "prizes";

  let body: React.ReactNode;
  switch (doc) {
    case "announcement":
      body = await Announcement(id, comp);
      break;
    case "reception":
      body = await Reception(id, comp);
      break;
    case "scoresheet":
      body = await ScoreSheets(id, comp);
      break;
    case "board":
      body = await Board(id, comp, theme);
      break;
    case "sheet":
      body = await HandSheet(id, comp);
      break;
    case "teamboard":
      body = await TeamBoard(id, comp, theme);
      break;
    case "prizes":
      body = await Prizes(id, comp, theme);
      break;
    case "survey":
      body = Survey(comp);
      break;
    case "receipts":
      body = await Receipts(id, comp);
      break;
    default:
      notFound();
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pageCss(size, orient) }} />
      <PrintToolbar showTheme={withTheme} />
      {body}
    </>
  );
}

/* ========== 案内文 ========== */

async function Announcement(id: string, comp: Awaited<ReturnType<typeof getComp>>) {
  if (!comp) return null;
  const [participants, groups] = await Promise.all([listParticipants(id), listGroups(id)]);
  const byId = new Map(participants.map((p) => [p.id, p]));

  return (
    <div className="print-sheet" style={{ fontFamily: "'Noto Serif JP', serif", lineHeight: 1.9 }}>
      <div style={{ textAlign: "right", fontSize: "0.85em" }}>{dateJa(comp.held_on)}</div>
      <h1
        style={{
          textAlign: "center",
          fontSize: "1.5em",
          fontWeight: 700,
          borderBottom: "2px solid #1a6b3c",
          paddingBottom: 12,
          margin: "12px 0 24px",
        }}
      >
        {comp.name}
      </h1>
      <p style={{ whiteSpace: "pre-wrap", marginBottom: 20 }}>{comp.ann_greeting ?? ""}</p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: "0.92em" }}>
        <tbody>
          <Row label="開催日時" value={`${dateJa(comp.held_on)} ${comp.start_time ? `${comp.start_time} スタート` : ""}`} />
          <Row label="集合時刻" value={comp.meet_time ?? "—"} />
          <Row label="会場" value={comp.venue ?? "—"} />
          <Row label="コース" value={comp.course ?? "—"} />
          <Row label="競技形式" value={formatLabel(comp.format)} />
          <Row label="参加費" value={yen(comp.fee)} />
          {comp.contact && <Row label="お問合せ" value={comp.contact} />}
          {comp.notes && <Row label="備考" value={comp.notes} />}
        </tbody>
      </table>

      {groups.length > 0 ? (
        <>
          <h2 style={{ margin: "28px 0 12px", fontSize: "1.05em", color: "#1a6b3c" }}>{comp.ann_group_title ?? "■ 組み合わせ表"}</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
            <thead>
              <tr>
                {["組", "スタートホール", "スタート時刻", "メンバー"].map((h) => (
                  <th key={h} style={{ background: "#1a6b3c", color: "#fff", padding: "8px 12px", textAlign: "left", border: "1px solid #ccc" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g, i) => (
                <tr key={g.id} style={{ background: i % 2 === 0 ? "#f9f9f9" : "#fff" }}>
                  <td style={cell}>{g.name}</td>
                  <td style={cell}>{g.tee ?? ""}</td>
                  <td style={cell}>{g.start_time ?? "—"}</td>
                  <td style={cell}>
                    {g.members
                      .map((m) => {
                        const p = byId.get(m.participant_id);
                        if (!p) return "";
                        return comp.ann_show_hcp && p.hcp != null ? `${p.name}（${p.hcp}）` : p.name;
                      })
                      .filter(Boolean)
                      .join("　")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p style={{ color: "#999", fontSize: "0.9em" }}>※ 組み合わせが作成されていません</p>
      )}

      <p style={{ whiteSpace: "pre-wrap", marginTop: 28 }}>{comp.ann_closing ?? ""}</p>
      <div style={{ textAlign: "right", marginTop: 32 }}>
        <div style={{ fontWeight: 700 }}>{comp.organizer ?? ""}</div>
        {comp.contact && <div>{comp.contact}</div>}
      </div>
    </div>
  );
}

const cell: React.CSSProperties = { padding: "8px 12px", border: "1px solid #ccc" };

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ ...cell, fontWeight: 700, background: "#f5f5f5", width: 130 }}>{label}</td>
      <td style={{ ...cell, whiteSpace: "pre-wrap" }}>{value}</td>
    </tr>
  );
}

/* ========== 受付表 ========== */

async function Reception(id: string, comp: Awaited<ReturnType<typeof getComp>>) {
  if (!comp) return null;
  const participants = await listParticipants(id);
  const fields = comp.reception_fields.filter((f) => f.visible !== false);

  return (
    <div className="print-sheet">
      <h1 style={{ textAlign: "center", fontSize: "1.4em", fontWeight: 700 }}>受付管理表</h1>
      <p style={{ textAlign: "center", fontSize: "0.85em", color: "#666", marginBottom: 16 }}>
        {comp.name} ／ {dateJa(comp.held_on)} ／ {comp.venue ?? ""}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
        <thead>
          <tr>
            {["#", "氏名", "フリガナ", "所属", "HCP", ...fields.map((f) => f.label)].map((h, i) => (
              <th key={i} style={{ background: "#1a6b3c", color: "#fff", padding: "6px 8px", border: "1px solid #ccc" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {participants.map((p, i) => (
            <tr key={p.id}>
              <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
              <td style={{ ...cell, fontWeight: 600 }}>{p.name}</td>
              <td style={cell}>{p.kana ?? ""}</td>
              <td style={cell}>{p.org ?? ""}</td>
              <td style={{ ...cell, textAlign: "center" }}>{p.hcp ?? ""}</td>
              {fields.map((f) => (
                <td key={f.id} style={{ ...cell, textAlign: "center", height: 28, minWidth: 56 }}>
                  {f.type === "checkin" || f.type === "paid" || f.type === "check" ? "□" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 12, fontSize: "0.8em", color: "#666" }}>
        参加予定：{participants.length}名 ／ 印刷日：{new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
      </p>
    </div>
  );
}

/* ========== スコアシート（組ごと・手書き） ========== */

const PAR_ROW = [4, 3, 4, 3, 4, 4, 3, 4, 5, 4, 3, 4, 3, 4, 4, 3, 4, 5];

async function ScoreSheets(id: string, comp: Awaited<ReturnType<typeof getComp>>) {
  if (!comp) return null;
  const [participants, groups, scores] = await Promise.all([listParticipants(id), listGroups(id), listScores(id)]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  const outPar = PAR_ROW.slice(0, 9).reduce((a, b) => a + b, 0);
  const inPar = PAR_ROW.slice(9).reduce((a, b) => a + b, 0);

  if (!groups.length) return <p className="print-sheet">組み合わせが作成されていません。</p>;

  return (
    <>
      {groups.map((g, gi) => (
        <div key={g.id} className={`print-sheet ${gi < groups.length - 1 ? "page-break" : ""}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: "1.2em" }}>{comp.name}</strong>
            <span style={{ fontSize: "0.85em", color: "#555" }}>
              {dateJa(comp.held_on)} ／ {comp.venue ?? ""} ／ {comp.course ?? ""}
            </span>
          </div>
          <div style={{ background: "#1a6b3c", color: "#fff", padding: "6px 12px", display: "flex", gap: 16, fontSize: "0.9em" }}>
            <strong>{g.name}</strong>
            <span>{g.tee ?? ""}</span>
            <span>スタート：{g.start_time ?? "—"}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em", textAlign: "center" }}>
            <thead>
              <tr style={{ background: "#2d9158", color: "#fff" }}>
                <th style={{ ...cell, textAlign: "left" }}>選手名</th>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i} style={cell}>{i + 1}</th>
                ))}
                <th style={{ ...cell, background: "#1a6b3c" }}>OUT</th>
                {Array.from({ length: 9 }, (_, i) => (
                  <th key={i + 9} style={cell}>{i + 10}</th>
                ))}
                <th style={{ ...cell, background: "#1a6b3c" }}>IN</th>
                <th style={{ ...cell, background: "#0d3d1f" }}>GROSS</th>
                <th style={{ ...cell, background: "#0d3d1f" }}>NET</th>
              </tr>
              <tr style={{ background: "#e8f5e9", fontSize: "0.9em" }}>
                <td style={{ ...cell, textAlign: "left", fontWeight: 600 }}>PAR</td>
                {PAR_ROW.slice(0, 9).map((p, i) => (
                  <td key={i} style={cell}>{p}</td>
                ))}
                <td style={{ ...cell, fontWeight: 700 }}>{outPar}</td>
                {PAR_ROW.slice(9).map((p, i) => (
                  <td key={i} style={cell}>{p}</td>
                ))}
                <td style={{ ...cell, fontWeight: 700 }}>{inPar}</td>
                <td style={{ ...cell, fontWeight: 700 }}>{outPar + inPar}</td>
                <td style={cell}>—</td>
              </tr>
            </thead>
            <tbody>
              {g.members.map((m) => {
                const p = byId.get(m.participant_id);
                if (!p) return null;
                const s = scores[p.id];
                const holes = (s?.holes ?? {}) as Record<string, number>;
                const out = Array.from({ length: 9 }, (_, i) => holes[`h${i + 1}`]).filter(Boolean);
                const inn = Array.from({ length: 9 }, (_, i) => holes[`h${i + 10}`]).filter(Boolean);
                const outSum = out.reduce((a, b) => a + b, 0);
                const inSum = inn.reduce((a, b) => a + b, 0);
                return (
                  <tr key={p.id}>
                    <td style={{ ...cell, textAlign: "left", fontWeight: 700, minWidth: 110 }}>{p.name}</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i} style={{ ...cell, height: 34, minWidth: 32 }}>{holes[`h${i + 1}`] ?? ""}</td>
                    ))}
                    <td style={{ ...cell, background: "#e8f5e9", fontWeight: 700 }}>{outSum || ""}</td>
                    {Array.from({ length: 9 }, (_, i) => (
                      <td key={i + 9} style={{ ...cell, height: 34, minWidth: 32 }}>{holes[`h${i + 10}`] ?? ""}</td>
                    ))}
                    <td style={{ ...cell, background: "#e8f5e9", fontWeight: 700 }}>{inSum || ""}</td>
                    <td style={{ ...cell, background: "#1a6b3c", color: "#fff", fontWeight: 700 }}>{outSum + inSum || ""}</td>
                    <td style={cell} />
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ marginTop: 8, fontSize: "0.78em", color: "#888" }}>
            競技形式：{formatLabel(comp.format)} ／ 主催：{comp.organizer ?? ""}
          </p>
        </div>
      ))}
    </>
  );
}

/* ========== 個人戦スコアボード ========== */

async function Board(id: string, comp: Awaited<ReturnType<typeof getComp>>, theme: (typeof THEMES)["green"]) {
  if (!comp) return null;
  const [participants, scores] = await Promise.all([listParticipants(id), listScores(id)]);
  const peria = isPeria(comp.format);
  const { ranked, noScore } = buildScoreRows(
    participants.map((p) => ({ id: p.id, name: p.name, hcp: p.hcp, org: p.org })),
    scores,
    comp.format
  );
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="print-sheet" style={{ padding: 0 }}>
      <div style={{ background: theme.bg, color: "#fff", padding: "20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "0.85em", opacity: 0.85 }}>{comp.venue ?? ""}</div>
        <div style={{ fontSize: "1.8em", fontWeight: 900, letterSpacing: "0.05em" }}>{comp.name}</div>
        <div style={{ fontSize: "0.85em", opacity: 0.85 }}>
          {dateJa(comp.held_on)} ／ 参加者 {participants.length}名 ／ {formatLabel(comp.format)}
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: theme.bg, color: "#fff" }}>
            {["順位", "氏名", "所属", peria ? "HCP(ペリア)" : "HCP", "GROSS", "NET", "特別賞等"].map((h) => (
              <th key={h} style={{ padding: "10px 8px", textAlign: h === "氏名" || h === "所属" || h === "特別賞等" ? "left" : "center" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ranked.map((r, i) => (
            <tr key={r.player.id} style={{ background: i % 2 === 0 ? theme.row : "#fff", fontWeight: i < 3 ? 700 : 400 }}>
              <td style={{ padding: "10px 8px", textAlign: "center", fontSize: i < 3 ? "1.5em" : "1em" }}>
                {r.rank && r.rank <= 3 ? medals[r.rank - 1] : `${r.rank}`}
                {r.tied ? <span style={{ fontSize: "0.5em", color: "#b45309" }}> 同</span> : null}
              </td>
              <td style={{ padding: "10px 8px", fontWeight: i < 3 ? 900 : 600 }}>{r.player.name}</td>
              <td style={{ padding: "10px 8px", fontSize: "0.85em", color: "#666" }}>{r.player.org ?? ""}</td>
              <td style={{ padding: "10px 8px", textAlign: "center" }}>{formatHcp(r.hcp, peria, r.player.hcp)}</td>
              <td style={{ padding: "10px 8px", textAlign: "center" }}>{r.gross}</td>
              <td style={{ padding: "10px 8px", textAlign: "center", fontWeight: 900 }}>{formatNet(r.net)}</td>
              <td style={{ padding: "10px 8px", fontSize: "0.85em" }}>{r.note}</td>
            </tr>
          ))}
          {noScore.map((r) => (
            <tr key={r.player.id} style={{ background: "#fafafa", color: "#aaa" }}>
              <td style={{ padding: 8, textAlign: "center" }}>—</td>
              <td style={{ padding: 8 }}>{r.player.name}</td>
              <td style={{ padding: 8 }}>{r.player.org ?? ""}</td>
              <td style={{ padding: 8, textAlign: "center" }}>—</td>
              <td style={{ padding: 8, textAlign: "center" }}>未入力</td>
              <td style={{ padding: 8, textAlign: "center" }}>—</td>
              <td style={{ padding: 8 }} />
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ textAlign: "center", padding: 12, fontSize: "0.78em", color: "#999" }}>
        主催：{comp.organizer ?? "—"} ／ 印刷日：{new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
      </p>
    </div>
  );
}

/* ========== 手書きシート（個人戦） ========== */

async function HandSheet(id: string, comp: Awaited<ReturnType<typeof getComp>>) {
  if (!comp) return null;
  const participants = await listParticipants(id);
  const cols = comp.sheet_cols.personal ?? DEFAULT_PERSONAL_SHEET_COLS;

  return (
    <div className="print-sheet">
      <h1 style={{ fontSize: "1.3em", fontWeight: 700, marginBottom: 4 }}>{comp.name}</h1>
      <p style={{ fontSize: "0.85em", color: "#666", marginBottom: 12 }}>
        {dateJa(comp.held_on)} ／ {comp.venue ?? ""} ／ {formatLabel(comp.format)}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95em" }}>
        <thead>
          <tr style={{ background: "#1a6b3c", color: "#fff" }}>
            {cols.map((c) => (
              <th key={c.id} style={{ ...cell, padding: "8px" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {participants.map((p, i) => (
            <tr key={p.id}>
              {cols.map((c) => (
                <td key={c.id} style={{ ...cell, height: 36, textAlign: c.id === "name" ? "left" : "center" }}>
                  {c.id === "no" ? i + 1 : c.id === "name" ? p.name : c.id === "hcp" && !isPeria(comp.format) ? (p.hcp ?? "") : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ========== 団体戦ボード ========== */

async function TeamBoard(id: string, comp: Awaited<ReturnType<typeof getComp>>, theme: (typeof THEMES)["green"]) {
  if (!comp) return null;
  const teams = await listTeams(id);
  const cols = comp.sheet_cols.team ?? DEFAULT_TEAM_SHEET_COLS;

  return (
    <div className="print-sheet" style={{ padding: 0 }}>
      <div style={{ background: theme.bg, color: "#fff", padding: "20px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "1.6em", fontWeight: 900 }}>{comp.name} 団体戦</div>
        <div style={{ fontSize: "0.85em", opacity: 0.85 }}>
          {dateJa(comp.held_on)} ／ {comp.venue ?? ""}
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: theme.sub, color: "#fff" }}>
            {cols.map((c) => (
              <th key={c.id} style={{ ...cell, padding: "10px 8px" }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => (
            <tr key={t.id} style={{ background: i % 2 === 0 ? theme.row : "#fff" }}>
              {cols.map((c) => (
                <td key={c.id} style={{ ...cell, height: 34, textAlign: c.id === "name" || c.id === "members" ? "left" : "center" }}>
                  {c.id === "no"
                    ? i + 1
                    : c.id === "name"
                      ? t.name
                      : c.id === "members"
                        ? (t.members ?? "")
                        : c.id === "score"
                          ? (t.score ?? "")
                          : c.id === "rank"
                            ? (t.rank_label ?? "")
                            : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ========== 景品一覧 ========== */

async function Prizes(id: string, comp: Awaited<ReturnType<typeof getComp>>, theme: (typeof THEMES)["green"]) {
  if (!comp) return null;
  const prizes = await listPrizes(id);
  return (
    <div className="print-sheet" style={{ padding: 0 }}>
      <div style={{ background: theme.bg, color: "#fff", padding: "28px 32px", textAlign: "center" }}>
        <div style={{ fontSize: "2.2em", fontWeight: 900, letterSpacing: "0.15em" }}>🏆 景品一覧</div>
        <div style={{ fontSize: "0.95em", opacity: 0.85 }}>{comp.name}</div>
        <div style={{ fontSize: "0.8em", opacity: 0.7 }}>{dateJa(comp.held_on)}</div>
      </div>
      <div style={{ padding: "24px 32px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "1.05em" }}>
          <thead>
            <tr style={{ background: theme.sub, color: "#fff" }}>
              <th style={{ ...cell, padding: "12px 20px", textAlign: "left" }}>賞の名称</th>
              <th style={{ ...cell, padding: "12px 20px", textAlign: "left" }}>景品名</th>
              <th style={{ ...cell, padding: "12px 20px", textAlign: "left" }}>受賞者</th>
            </tr>
          </thead>
          <tbody>
            {prizes.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 0 ? theme.row : "#fff" }}>
                <td style={{ ...cell, padding: "12px 20px", fontWeight: 700, color: theme.bg }}>{p.label}</td>
                <td style={{ ...cell, padding: "12px 20px" }}>{p.prize_name || "—"}</td>
                <td style={{ ...cell, padding: "12px 20px" }}>{p.winner_name || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ textAlign: "center", padding: 16, fontSize: "0.8em", color: "#999" }}>主催：{comp.organizer ?? "—"}</p>
    </div>
  );
}

/* ========== アンケート ========== */

function Survey(comp: NonNullable<Awaited<ReturnType<typeof getComp>>>) {
  const title = comp.survey_title || `${comp.name} アンケート`;
  return (
    <div className="print-sheet">
      <div style={{ borderBottom: "3px solid #1a6b3c", paddingBottom: 12, marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.4em", color: "#1a6b3c" }}>{title}</h1>
        <p style={{ fontSize: "0.85em", color: "#555" }}>
          {comp.name} ／ {dateJa(comp.held_on)} ／ {comp.venue ?? ""}
        </p>
        {comp.survey_desc && <p style={{ marginTop: 8, fontSize: "0.9em", whiteSpace: "pre-wrap" }}>{comp.survey_desc}</p>}
      </div>
      {comp.survey_questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 18, padding: 14, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            {i + 1}. {q.text}
          </div>
          {q.options.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: q.options.length > 4 ? "1fr 1fr" : "1fr", gap: 4 }}>
              {q.options.map((o) => (
                <div key={o} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid #ccc",
                      borderRadius: q.type === "radio" ? "50%" : 3,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: "0.9em" }}>{o}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: "1px solid #ccc", borderRadius: 6, minHeight: 60 }} />
          )}
        </div>
      ))}
      <p style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #ccc", fontSize: "0.78em", color: "#888", textAlign: "center" }}>
        ご回答ありがとうございます。このシートを受付にお渡しください。
      </p>
    </div>
  );
}

/* ========== 領収書 ========== */

async function Receipts(id: string, comp: Awaited<ReturnType<typeof getComp>>) {
  if (!comp) return null;
  const [receipts, participants] = await Promise.all([listReceipts(id), listParticipants(id)]);
  const byId = new Map(participants.map((p) => [p.id, p]));
  if (!receipts.length) return <p className="print-sheet">まだ領収書が発行されていません。</p>;

  return (
    <>
      {receipts.map((r, i) => {
        const p = r.participant_id ? byId.get(r.participant_id) : null;
        return (
          <div key={r.id} className={`print-sheet ${i < receipts.length - 1 ? "page-break" : ""}`} style={{ fontFamily: "'Noto Serif JP', serif" }}>
            <div style={{ border: "2px solid #ccc", padding: "32px 40px" }}>
              <div
                style={{
                  textAlign: "center",
                  fontSize: "2em",
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  borderBottom: "3px double #333",
                  paddingBottom: 12,
                }}
              >
                領　収　書
              </div>
              <div style={{ textAlign: "right", fontSize: "0.8em", color: "#666", margin: "8px 0 24px" }}>No. {r.receipt_no}</div>
              <div style={{ fontSize: "1.2em", fontWeight: 700, borderBottom: "2px solid #333", paddingBottom: 8 }}>
                {p ? `${p.name}　様` : "　　　　　　　　　　様"}
              </div>
              <div
                style={{
                  textAlign: "center",
                  fontSize: "1.9em",
                  fontWeight: 900,
                  color: "#1a6b3c",
                  background: "#f0fff4",
                  border: "1px solid #c6f6d5",
                  borderRadius: 8,
                  padding: 16,
                  margin: "20px 0",
                }}
              >
                ¥{r.amount.toLocaleString("ja-JP")} 円 也
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9em" }}>
                <tbody>
                  <ReceiptRow label="但し" value={r.purpose ?? "ゴルフコンペ参加費として"} />
                  <ReceiptRow label="発行日" value={dateJa(r.issued_on)} />
                  <ReceiptRow label="イベント名" value={comp.name} />
                  <ReceiptRow label="開催日" value={dateJa(comp.held_on)} />
                  <ReceiptRow label="会場" value={comp.venue ?? "—"} />
                </tbody>
              </table>
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #ddd" }}>
                <div style={{ fontWeight: 700 }}>{r.issuer || comp.organizer || ""}</div>
                {comp.contact && <div style={{ fontSize: "0.85em", color: "#555" }}>{comp.contact}</div>}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: "6px 0", borderBottom: "1px dotted #ccc", color: "#555", width: 110 }}>{label}</td>
      <td style={{ padding: "6px 0", borderBottom: "1px dotted #ccc", fontWeight: 600 }}>{value}</td>
    </tr>
  );
}
