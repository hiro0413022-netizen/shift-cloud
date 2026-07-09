/*
 * report-os / generate.js
 * 事業所ごとの月次資料(.pptx)を JSON データから生成する。
 * 使い方: node generate.js data/golfwing-2026-06.json [出力先.pptx]
 */
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

const C = {
  darkGreen: "13311E", green: "1E6B3A", midGreen: "3E8E5A", gold: "C9A24B",
  light: "FFFFFF", tint: "F1F5F1", tint2: "E7EFE8", text: "1B2A20", muted: "6B7B70",
  up: "1E6B3A", down: "C0392B", line: "D8E2DA",
};
const FONT = "Meiryo";

const nfInt = (n) => Number(n).toLocaleString("ja-JP");
const fmtVal = (v, unit) => {
  if (unit === "円") return "¥" + nfInt(v);
  if (unit === "%") return (Math.round(v * 10) / 10) + "%";
  return nfInt(v) + (unit || "");
};
function delta(cur, base, unit, lowerBetter = false) {
  if (base == null || cur == null) return { txt: "—", color: C.muted };
  const diff = cur - base;
  let pct = base !== 0 ? (diff / Math.abs(base)) * 100 : 0;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  let diffStr;
  if (unit === "円") diffStr = sign + nfInt(Math.round(diff)) + "円";
  else if (unit === "%") diffStr = sign + (Math.round(diff * 10) / 10) + "pt";
  else diffStr = sign + nfInt(diff) + (unit || "");
  const pctStr = base !== 0 ? " (" + (diff > 0 ? "+" : "") + (Math.round(pct * 10) / 10) + "%)" : "";
  const good = lowerBetter ? diff < 0 : diff > 0;
  const color = diff === 0 ? C.muted : good ? C.up : C.down;
  return { txt: diffStr + pctStr, color };
}

function build(data, outPath) {
  const p = new pptxgen();
  p.defineLayout({ name: "W", width: 10, height: 5.625 });
  p.layout = "W";
  p.author = data.meta.author || "YOZAN GENESIS";
  p.title = `${data.meta.business} 月次報告 ${data.meta.monthLabel}`;
  const mkShadow = () => ({ type: "outer", color: "000000", blur: 7, offset: 2, angle: 90, opacity: 0.1 });

  // 1. 表紙
  (() => {
    const s = p.addSlide();
    s.background = { color: C.darkGreen };
    s.addShape(p.shapes.OVAL, { x: 7.4, y: -1.6, w: 4.6, h: 4.6, fill: { color: C.green }, line: { type: "none" } });
    s.addShape(p.shapes.OVAL, { x: 8.7, y: 3.4, w: 3.2, h: 3.2, fill: { color: "1A4A2A" }, line: { type: "none" } });
    s.addText("MONTHLY REPORT", { x: 0.7, y: 1.15, w: 6, h: 0.4, fontFace: FONT, fontSize: 13, color: C.gold, charSpacing: 4, bold: true });
    s.addText(data.meta.business, { x: 0.68, y: 1.55, w: 8, h: 1.0, fontFace: FONT, fontSize: 52, color: C.light, bold: true });
    s.addText("月次報告書", { x: 0.7, y: 2.6, w: 8, h: 0.7, fontFace: FONT, fontSize: 26, color: "CFE0D3" });
    s.addText(data.meta.monthLabel, { x: 0.7, y: 3.3, w: 8, h: 0.6, fontFace: FONT, fontSize: 22, color: C.gold, bold: true });
    s.addShape(p.shapes.LINE, { x: 0.75, y: 4.55, w: 3.0, h: 0, line: { color: C.gold, width: 1.5 } });
    s.addText([{ text: (data.meta.businessSub || "") + "　", options: { color: "CFE0D3" } }, { text: data.meta.company || "", options: { color: "CFE0D3" } }],
      { x: 0.7, y: 4.7, w: 8.6, h: 0.35, fontFace: FONT, fontSize: 12 });
    s.addText(`作成: ${data.meta.author || ""}`, { x: 0.7, y: 5.05, w: 8.6, h: 0.35, fontFace: FONT, fontSize: 10, color: "8FA896" });
  })();

  function header(s, title, idx) {
    s.background = { color: C.light };
    s.addText(title, { x: 0.5, y: 0.32, w: 8.2, h: 0.6, fontFace: FONT, fontSize: 26, color: C.text, bold: true, margin: 0 });
    s.addText(`${data.meta.business}　${data.meta.monthLabel}`, { x: 0.5, y: 0.9, w: 8, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted, margin: 0 });
    s.addText(String(idx).padStart(2, "0"), { x: 9.0, y: 0.3, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 24, color: C.tint2, bold: true, align: "right" });
  }

  // 2. サマリー
  (() => {
    const s = p.addSlide();
    header(s, "今月のサマリー", 2);
    const k = data.kpi;
    const cards = [
      { d: k.members, lb: false }, { d: k.trialBookings, lb: false }, { d: k.conversionRate, lb: false },
      { d: k.churnRate, lb: true }, { d: k.retailSales, lb: false }, { d: k.fittings, lb: false },
    ];
    const cols = 3, gap = 0.25, mx = 0.5, top = 1.45;
    const cw = (10 - mx * 2 - gap * (cols - 1)) / cols;
    const ch = 1.78, vgap = 0.22;
    cards.forEach((c, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = mx + col * (cw + gap), y = top + row * (ch + vgap);
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: ch, rectRadius: 0.08, fill: { color: C.tint }, line: { type: "none" }, shadow: mkShadow() });
      s.addText(c.d.label, { x: x + 0.22, y: y + 0.16, w: cw - 0.4, h: 0.3, fontFace: FONT, fontSize: 12, color: C.muted, bold: true, margin: 0 });
      if (c.d.current == null) {
        s.addText("取込待ち", { x: x + 0.2, y: y + 0.52, w: cw - 0.4, h: 0.5, fontFace: FONT, fontSize: 22, color: C.muted, bold: true, margin: 0 });
        s.addText(c.d.pending || "データ取込待ち", { x: x + 0.22, y: y + 1.2, w: cw - 0.4, h: 0.5, fontFace: FONT, fontSize: 9.5, color: C.muted, italic: true, margin: 0 });
      } else {
        s.addText(fmtVal(c.d.current, c.d.unit), { x: x + 0.2, y: y + 0.44, w: cw - 0.4, h: 0.6, fontFace: FONT, fontSize: c.d.unit === "円" ? 26 : 34, color: C.green, bold: true, margin: 0 });
        const dm = delta(c.d.current, c.d.prevMonth, c.d.unit, c.lb);
        const dy = delta(c.d.current, c.d.prevYear, c.d.unit, c.lb);
        s.addText([{ text: "前月比 ", options: { color: C.muted } }, { text: dm.txt, options: { color: dm.color, bold: true } }],
          { x: x + 0.22, y: y + 1.14, w: cw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, margin: 0 });
        s.addText([{ text: "前年比 ", options: { color: C.muted } }, { text: dy.txt, options: { color: dy.color, bold: true } }],
          { x: x + 0.22, y: y + 1.42, w: cw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, margin: 0 });
      }
    });
  })();

  // 3. 会員数の推移
  (() => {
    const s = p.addSlide();
    header(s, "会員数の推移", 3);
    const m = data.kpi.members;
    const t = data.memberTrend;
    s.addChart(p.charts.LINE, [{ name: "正会員", labels: t.map((r) => r.m), values: t.map((r) => r.v) }], {
      x: 0.5, y: 1.35, w: 6.4, h: 2.8, chartColors: [C.green], lineSize: 3, lineSmooth: true,
      lineDataSymbol: "circle", lineDataSymbolSize: 6, showValue: false, showLegend: false, showTitle: false,
      chartArea: { fill: { color: "FFFFFF" } },
      catAxisLabelColor: C.muted, catAxisLabelFontSize: 9, catAxisLabelFontFace: FONT,
      valAxisLabelColor: C.muted, valAxisLabelFontSize: 9,
      valAxisMinVal: Math.floor(Math.min(...t.map((r) => r.v)) / 10) * 10 - 10,
      valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
    });
    const dm = delta(m.current, m.prevMonth, "人");
    const bx = 7.15, bw = 2.35;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: bx, y: 1.35, w: bw, h: 1.18, rectRadius: 0.08, fill: { color: C.tint }, line: { type: "none" } });
    s.addText("当月 会員数（正会員）", { x: bx + 0.2, y: 1.45, w: bw - 0.4, h: 0.26, fontFace: FONT, fontSize: 10.5, color: C.muted, bold: true, margin: 0 });
    s.addText(nfInt(m.current) + "人", { x: bx + 0.2, y: 1.71, w: bw - 0.4, h: 0.5, fontFace: FONT, fontSize: 31, color: C.green, bold: true, margin: 0 });
    s.addText([{ text: "前月比 ", options: { color: C.muted } }, { text: dm.txt, options: { color: dm.color, bold: true } }],
      { x: bx + 0.2, y: 2.22, w: bw - 0.4, h: 0.26, fontFace: FONT, fontSize: 10.5, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: bx, y: 2.66, w: bw, h: 1.0, rectRadius: 0.08, fill: { color: C.tint }, line: { type: "none" } });
    s.addText("当月の異動", { x: bx + 0.2, y: 2.76, w: bw - 0.4, h: 0.24, fontFace: FONT, fontSize: 10.5, color: C.muted, bold: true, margin: 0 });
    s.addText([{ text: "新規入会　", options: { color: C.text } }, { text: nfInt(m.newJoins) + "人", options: { color: C.up, bold: true } }],
      { x: bx + 0.2, y: 3.02, w: bw - 0.4, h: 0.3, fontFace: FONT, fontSize: 13, margin: 0 });
    s.addText([{ text: "退会者数　", options: { color: C.text } }, { text: nfInt(m.leavers) + "人", options: { color: C.down, bold: true } }],
      { x: bx + 0.2, y: 3.33, w: bw - 0.4, h: 0.3, fontFace: FONT, fontSize: 13, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: bx, y: 3.79, w: bw, h: 1.36, rectRadius: 0.08, fill: { color: C.darkGreen }, line: { type: "none" } });
    s.addText("会員数に含まない区分", { x: bx + 0.2, y: 3.88, w: bw - 0.4, h: 0.24, fontFace: FONT, fontSize: 9.5, color: C.gold, bold: true, margin: 0 });
    s.addText((m.excluded || []).map((e) => ({ text: `${e.label}　${e.v == null ? "要確認" : nfInt(e.v) + "人"}`, options: { color: "E6EFE8", breakLine: true } })),
      { x: bx + 0.2, y: 4.14, w: bw - 0.4, h: 0.95, fontFace: FONT, fontSize: 10.5, margin: 0, lineSpacingMultiple: 1.12 });
    const comp = (m.composition || []).map((e) => `${e.t}${nfInt(e.v)}`).join(" / ");
    if (comp) s.addText([{ text: "会員構成（会員種類名）: ", options: { bold: true, color: C.text } }, { text: comp, options: { color: C.muted } }],
      { x: 0.5, y: 4.16, w: 6.4, h: 0.4, fontFace: FONT, fontSize: 9, margin: 0, lineSpacingMultiple: 1.03 });
    s.addText("※ " + (m.rule || ""), { x: 0.5, y: 4.6, w: 6.4, h: 0.7, fontFace: FONT, fontSize: 8, color: C.muted, italic: true, margin: 0 });
  })();

  // 4. 物販・フィッティング
  (() => {
    const s = p.addSlide();
    header(s, "物販売上・フィッティング", 4);
    const rt = data.retailTrend;
    s.addChart(p.charts.BAR, [{ name: "物販売上", labels: rt.map((r) => r.m), values: rt.map((r) => r.v) }], {
      x: 0.5, y: 1.35, w: 6.4, h: 3.9, barDir: "col", chartColors: [C.midGreen],
      showValue: false, showLegend: false, showTitle: false, chartArea: { fill: { color: "FFFFFF" } },
      catAxisLabelColor: C.muted, catAxisLabelFontSize: 9, catAxisLabelFontFace: FONT,
      valAxisLabelColor: C.muted, valAxisLabelFontSize: 9,
      valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
    });
    const rs = data.kpi.retailSales, ft = data.kpi.fittings;
    const bx = 7.15, bw = 2.35;
    const dmr = delta(rs.current, rs.prevMonth, "円");
    const dmf = delta(ft.current, ft.prevMonth, "件");
    const dyf = delta(ft.current, ft.prevYear, "件");
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: bx, y: 1.35, w: bw, h: 1.35, rectRadius: 0.08, fill: { color: C.tint }, line: { type: "none" } });
    s.addText("当月 物販売上", { x: bx + 0.2, y: 1.48, w: bw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, color: C.muted, bold: true, margin: 0 });
    s.addText("¥" + nfInt(rs.current), { x: bx + 0.2, y: 1.78, w: bw - 0.4, h: 0.45, fontFace: FONT, fontSize: 19, color: C.green, bold: true, margin: 0 });
    s.addText([{ text: "前月比 ", options: { color: C.muted } }, { text: dmr.txt, options: { color: dmr.color, bold: true } }],
      { x: bx + 0.2, y: 2.28, w: bw - 0.4, h: 0.3, fontFace: FONT, fontSize: 11, margin: 0 });
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: bx, y: 2.85, w: bw, h: 1.6, rectRadius: 0.08, fill: { color: C.darkGreen }, line: { type: "none" } });
    s.addText("フィッティング件数", { x: bx + 0.2, y: 2.98, w: bw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, color: C.gold, bold: true, margin: 0 });
    s.addText(ft.current == null ? "取込待ち" : nfInt(ft.current) + "件", { x: bx + 0.2, y: 3.26, w: bw - 0.4, h: 0.55, fontFace: FONT, fontSize: ft.current == null ? 22 : 34, color: C.light, bold: true, margin: 0, valign: "middle" });
    if (ft.current == null) {
      s.addText(ft.pending || "取込待ち", { x: bx + 0.2, y: 3.82, w: bw - 0.4, h: 0.5, fontFace: FONT, fontSize: 9.5, color: "CFE0D3", italic: true, margin: 0 });
    } else {
      s.addText([{ text: "前月比 ", options: { color: "9FB6A6" } }, { text: dmf.txt, options: { color: "FFFFFF", bold: true } }],
        { x: bx + 0.2, y: 3.82, w: bw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, margin: 0 });
      s.addText([{ text: "前年比 ", options: { color: "9FB6A6" } }, { text: dyf.txt, options: { color: "FFFFFF", bold: true } }],
        { x: bx + 0.2, y: 4.1, w: bw - 0.4, h: 0.28, fontFace: FONT, fontSize: 11, margin: 0 });
    }
  })();

  // 5. 月間の実施事項
  (() => {
    const s = p.addSlide();
    header(s, "月間の実施事項", 5);
    const items = data.narrative.activities;
    const top = 1.4, gap = 0.15;
    const h = (5.35 - top - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const y = top + i * (h + gap);
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: 9.0, h, rectRadius: 0.06, fill: { color: C.tint }, line: { type: "none" } });
      s.addShape(p.shapes.OVAL, { x: 0.72, y: y + h / 2 - 0.22, w: 0.44, h: 0.44, fill: { color: C.green }, line: { type: "none" } });
      s.addText(String(i + 1), { x: 0.72, y: y + h / 2 - 0.22, w: 0.44, h: 0.44, fontFace: FONT, fontSize: 16, color: C.light, bold: true, align: "center", valign: "middle", margin: 0 });
      s.addText(it, { x: 1.35, y: y + 0.08, w: 7.95, h: h - 0.16, fontFace: FONT, fontSize: 12.5, color: C.text, valign: "middle", margin: 0 });
    });
  })();

  // 6. 課題と対策
  (() => {
    const s = p.addSlide();
    header(s, "問題点の洗い出し ／ 実施予定（解決策）", 6);
    const probs = data.narrative.problems, plans = data.narrative.plans;
    const n = Math.max(probs.length, plans.length);
    const top = 1.75, gap = 0.18;
    const h = (5.35 - top - gap * (n - 1)) / n;
    const colW = 4.4;
    s.addText("問題点", { x: 0.5, y: 1.32, w: colW, h: 0.35, fontFace: FONT, fontSize: 14, color: C.down, bold: true, margin: 0 });
    s.addText("実施予定・解決策", { x: 5.1, y: 1.32, w: colW, h: 0.35, fontFace: FONT, fontSize: 14, color: C.green, bold: true, margin: 0 });
    for (let i = 0; i < n; i++) {
      const y = top + i * (h + gap);
      if (probs[i]) {
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 0.5, y, w: colW, h, rectRadius: 0.06, fill: { color: "FBEEEC" }, line: { type: "none" } });
        s.addText(probs[i], { x: 0.7, y: y + 0.06, w: colW - 0.4, h: h - 0.12, fontFace: FONT, fontSize: 11, color: C.text, valign: "middle", margin: 0 });
      }
      if (plans[i]) {
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 5.1, y, w: colW, h, rectRadius: 0.06, fill: { color: C.tint2 }, line: { type: "none" } });
        s.addText(plans[i], { x: 5.3, y: y + 0.06, w: colW - 0.4, h: h - 0.12, fontFace: FONT, fontSize: 11, color: C.text, valign: "middle", margin: 0 });
      }
      if (probs[i] && plans[i]) {
        s.addShape(p.shapes.LINE, { x: 4.95, y: y + h / 2 - 0.09, w: 0.2, h: 0, line: { color: C.gold, width: 2, endArrowType: "triangle" } });
      }
    }
  })();

  // 7. その他 情報共有事項
  (() => {
    const s = p.addSlide();
    header(s, "その他 情報共有事項", 7);
    const items = data.narrative.shareInfo;
    const top = 1.5, gap = 0.2;
    const h = (5.2 - top - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const y = top + i * (h + gap);
      s.addShape(p.shapes.OVAL, { x: 0.55, y: y + h / 2 - 0.06, w: 0.13, h: 0.13, fill: { color: C.gold }, line: { type: "none" } });
      s.addText(it, { x: 0.9, y, w: 8.6, h, fontFace: FONT, fontSize: 12.5, color: C.text, valign: "middle", margin: 0 });
    });
  })();

  // 8. 指標一覧
  (() => {
    const s = p.addSlide();
    header(s, "指標一覧", 8);
    const k = data.kpi;
    const rows = [
      ["members", false], ["trialBookings", false], ["conversionRate", false],
      ["churnRate", true], ["retailSales", false], ["fittings", false], ["staff", false],
    ];
    const head = ["指標", "当月", "前月", "前月比", "前年同月", "前年比"].map((t) => ({
      text: t, options: { fill: { color: C.darkGreen }, color: "FFFFFF", bold: true, fontFace: FONT, fontSize: 11.5, align: "center", valign: "middle" },
    }));
    const body = rows.map(([key, lb], i) => {
      const d = k[key];
      const dm = delta(d.current, d.prevMonth, d.unit, lb);
      const dy = delta(d.current, d.prevYear, d.unit, lb);
      const fill = i % 2 ? "F4F8F5" : "FFFFFF";
      const cell = (t, opt = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 10.5, valign: "middle", fill: { color: fill }, color: C.text, ...opt } });
      return [
        cell(d.label, { bold: true, align: "left" }),
        cell(d.current == null ? "取込待ち" : fmtVal(d.current, d.unit), { align: "right", bold: true, color: d.current == null ? C.muted : C.text }),
        cell(d.prevMonth != null ? fmtVal(d.prevMonth, d.unit) : "—", { align: "right", color: C.muted }),
        cell(dm.txt, { align: "right", color: dm.color }),
        cell(d.prevYear != null ? fmtVal(d.prevYear, d.unit) : "—", { align: "right", color: C.muted }),
        cell(dy.txt, { align: "right", color: dy.color }),
      ];
    });
    const mm = k.members;
    const extra = (label, val) => {
      const fill = body.length % 2 ? "F4F8F5" : "FFFFFF";
      const cell = (t, opt = {}) => ({ text: t, options: { fontFace: FONT, fontSize: 10.5, valign: "middle", fill: { color: fill }, color: C.text, ...opt } });
      return [cell(label, { bold: true, align: "left", color: C.muted }), cell(nfInt(val) + "人", { align: "right", bold: true }),
        cell("—", { align: "right", color: C.muted }), cell("—", { align: "right", color: C.muted }),
        cell("—", { align: "right", color: C.muted }), cell("—", { align: "right", color: C.muted })];
    };
    if (mm.newJoins != null) body.push(extra("　新規入会（当月）", mm.newJoins));
    if (mm.leavers != null) body.push(extra("　退会者数（当月）", mm.leavers));
    s.addTable([head, ...body], {
      x: 0.5, y: 1.4, w: 9.0, colW: [1.9, 1.1, 1.1, 1.7, 1.15, 2.05], rowH: 0.375,
      border: { type: "solid", pt: 0.5, color: C.line }, align: "center", valign: "middle",
    });
    if (data.meta.note_data)
      s.addText("※ " + data.meta.note_data, { x: 0.5, y: 5.22, w: 9.0, h: 0.35, fontFace: FONT, fontSize: 8, color: C.muted, italic: true, margin: 0 });
  })();

  return p.writeFile({ fileName: outPath });
}

const dataPath = process.argv[2] || path.join(__dirname, "data", "golfwing-2026-06.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const outName = process.argv[3] || `${data.meta.business.replace(/\s+/g, "")}_月次報告_${data.meta.month}.pptx`;
build(data, outName).then((f) => console.log("生成完了:", f));
