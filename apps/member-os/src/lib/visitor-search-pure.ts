// 来店検索の名寄せ（DB関数 search_visitors の結果を「人」単位にまとめる）
//
// DB側（0109_visitor_search.sql）は 一時利用者 / GOLF WING会員 / FRANK会員 / FRANKビジター を
// 平らに返してくる。同じ人が複数のソースに載っていることは普通にある（体験で来た人が入会した等）。
// ここで1枚のカードにまとめないと「この人、前に来た？」に答えられないので、アプリ側で名寄せする。
//
// 名寄せの鍵は「間違って別人をくっつけない」ことを優先して選ぶ:
//   ① 電話番号（数字の下10桁）  ② メールアドレス  ③ カナ or 氏名 ＋ 生年月日
// 氏名だけ・カナだけでは絶対にくっつけない（同姓同名が普通にいるため）。

export type VisitKind = "guest" | "member" | "frank" | "frank_guest";

export type VisitRecord = {
  date: string | null;
  type: string | null;
  store?: string | null;
  fee?: number | null;
  result?: string | null;
  pro?: string | null;
  staff?: string | null;
  payment?: string | null;
  discount?: string | null;
  status?: string | null;
  start?: string | null;
  end?: string | null;
  note?: string | null;
};

export type Hit = {
  kind: VisitKind;
  id: string;
  name: string | null;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  address?: string | null;
  occupation?: string | null;
  contact_method?: string | null;
  note?: string | null;
  member_no?: string | null;
  member_type?: string | null;
  class_name?: string | null;
  store?: string | null;
  status?: string | null;
  plan?: string | null;
  alert_note?: string | null;
  join_date?: string | null;
  leave_date?: string | null;
  leave_reason?: string | null;
  monthly_visits?: number | null;
  visit_count: number;
  first_visit: string | null;
  last_visit: string | null;
  visits: VisitRecord[];
};

export type Person = {
  key: string;
  name: string;
  nameKana: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
  gender: string | null;
  address: string | null;
  note: string | null;
  alertNote: string | null;
  hits: Hit[];
  visits: VisitRecord[];
  visitCount: number;
  firstVisit: string | null;
  lastVisit: string | null;
};

/* ---------------- 正規化 ---------------- */

export function digits(s: string | null | undefined): string {
  return String(s ?? "").replace(/[^0-9]/g, "");
}

/** 全角スペース・半角スペース・記号を落として比較用にする */
function normName(s: string | null | undefined): string {
  return String(s ?? "").replace(/[\s　・.,]/g, "").toLowerCase();
}

/** ひらがな→カタカナに寄せる（名簿によって表記がぶれるため） */
function normKana(s: string | null | undefined): string {
  return normName(s).replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

function keysOf(h: Hit): string[] {
  const keys: string[] = [];
  const d = digits(h.phone);
  if (d.length >= 10) keys.push(`p:${d.slice(-10)}`);
  if (h.email) keys.push(`e:${h.email.trim().toLowerCase()}`);
  if (h.birth_date) {
    const kana = normKana(h.name_kana);
    if (kana) keys.push(`k:${kana}|${h.birth_date}`);
    const nm = normName(h.name);
    if (nm) keys.push(`n:${nm}|${h.birth_date}`);
  }
  return keys;
}

const KIND_PRIORITY: Record<VisitKind, number> = { frank: 0, guest: 1, member: 2, frank_guest: 3 };

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
function minDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

/** search_visitors の生JSON → 人単位の配列（最終来店が新しい順） */
export function mergePeople(raw: unknown): Person[] {
  const hits: Hit[] = Array.isArray(raw) ? (raw as Hit[]) : [];

  // キー共有でグルーピング（1件が複数キーを持つので、既存グループのどれかに当たれば合流）
  const groups: { keys: Set<string>; hits: Hit[] }[] = [];
  const index = new Map<string, number>();

  for (const h of hits) {
    const ks = keysOf(h);
    const found = new Set<number>();
    for (const k of ks) {
      const gi = index.get(k);
      if (gi !== undefined) found.add(gi);
    }
    if (found.size === 0) {
      groups.push({ keys: new Set(ks), hits: [h] });
      const gi = groups.length - 1;
      for (const k of ks) index.set(k, gi);
      continue;
    }
    // 複数グループにまたがったら先頭へ統合する
    const targets = [...found].sort((a, b) => a - b);
    const g = groups[targets[0]];
    g.hits.push(h);
    for (const k of ks) {
      g.keys.add(k);
      index.set(k, targets[0]);
    }
    for (const other of targets.slice(1)) {
      const o = groups[other];
      g.hits.push(...o.hits);
      for (const k of o.keys) {
        g.keys.add(k);
        index.set(k, targets[0]);
      }
      o.hits = [];
      o.keys = new Set();
    }
  }

  const people: Person[] = [];
  for (const g of groups) {
    if (g.hits.length === 0) continue;
    const sorted = [...g.hits].sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind]);
    const pick = <K extends keyof Hit>(field: K): Hit[K] | null => {
      for (const h of sorted) {
        const v = h[field] as unknown;
        if (v !== null && v !== undefined && v !== "") return v as Hit[K];
      }
      return null;
    };

    const visits = sorted
      .flatMap((h) => (Array.isArray(h.visits) ? h.visits : []))
      .sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

    let first: string | null = null;
    let last: string | null = null;
    let count = 0;
    for (const h of sorted) {
      count += Number(h.visit_count ?? 0);
      first = minDate(first, h.first_visit ?? null);
      last = maxDate(last, h.last_visit ?? null);
    }

    people.push({
      key: sorted.map((h) => `${h.kind}:${h.id}`).join("+"),
      name: String(pick("name") ?? "（氏名なし）"),
      nameKana: (pick("name_kana") as string | null) ?? null,
      phone: (pick("phone") as string | null) ?? null,
      email: (pick("email") as string | null) ?? null,
      birthDate: (pick("birth_date") as string | null) ?? null,
      gender: (pick("gender") as string | null) ?? null,
      address: (pick("address") as string | null) ?? null,
      note: (pick("note") as string | null) ?? null,
      alertNote: (pick("alert_note") as string | null) ?? null,
      hits: sorted,
      visits,
      visitCount: count,
      firstVisit: first,
      lastVisit: last,
    });
  }

  return people.sort((a, b) => {
    const d = String(b.lastVisit ?? "").localeCompare(String(a.lastVisit ?? ""));
    return d !== 0 ? d : b.visitCount - a.visitCount;
  });
}
