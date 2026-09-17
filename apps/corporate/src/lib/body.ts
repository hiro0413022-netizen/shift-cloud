// ブログ本文の書式（管理画面とホームページで同じものを使う。コピーして持つ）
//   ## 見出し / ### 小見出し / - 箇条書き / ![説明](写真URL) / [文字](URL) / **太字**
//   空行で段落、改行はそのまま改行。HTMLは書けない（全部エスケープ）。
function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function safeUrl(u: string) {
  const t = u.trim();
  return /^(https?:\/\/|\/|mailto:|tel:)/i.test(t) ? t : "#";
}
function inline(s: string) {
  let out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    const ext = /^https?:/i.test(href);
    return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
  });
  return out;
}
export function renderBody(src: string): string {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) html.push(`<p>${para.map(inline).join("<br />")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) html.push(`<ul>${list.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (line.startsWith("### ")) {
      flushPara();
      flushList();
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (/^[-・]\s?/.test(line) && !line.startsWith("--")) {
      flushPara();
      list.push(line.replace(/^[-・]\s?/, ""));
    } else if (img) {
      flushPara();
      flushList();
      html.push(
        `<figure><img src="${esc(safeUrl(img[2]))}" alt="${esc(img[1])}" loading="lazy" />${
          img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ""
        }</figure>`,
      );
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("\n");
}
