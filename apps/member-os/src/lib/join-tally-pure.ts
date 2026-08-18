// ダッシュボード「入会者数」の暫定集計（GOLF WING 宝塚のみ）
//
// 入会者の正典は会員名簿（Smart Hello → /import で取り込む mbr_members.join_date）。
// ただし名簿の取込は月に何度も回さないので、取り込むまでカードが 0 のままになり
// 「今月まだ1人も入っていない」と読めてしまう（実際には受付台帳に入会が記録されている）。
//
// そこで受付台帳（mbr_walkin_visits.result = 'join'）の入会も拾い、
//   暫定入会者 ＝ 名簿の入会者 ＋ 台帳の入会者のうち名簿にまだ載っていない人
// を表示する。名簿を取り込むと台帳側は自動的に落ちる（＝二重に数えない）ので、
// 暫定→確定へ数字が滑らかに移り、確定値は今まで通りエクセル取込が決める。
//
// FRANK GOLF 姫路はこの経路を使わない（入会は Genesis / frunk_members が正）。
//
// 突き合わせの考え方:
//   比較する相手は「同じ店の同じ月に入会した人」だけ＝多くても数十人。
//   ここで数え落とすより二重に数えるほうが害が大きいので、氏名（またはカナ）の一致で同一人とみなす。
//   ただし生年月日が両方あって食い違うときは、同姓同名の別人なので絶対にくっつけない。
//   （来店検索 visitor-search-pure.ts の名寄せは顧客全体が相手なので、そちらはより厳しい鍵を使う）

export type RosterJoin = {
  name: string | null;
  nameKana?: string | null;
  birthDate?: string | null;
  memberType?: string | null;
};

export type LedgerJoin = {
  name: string | null;
  nameKana?: string | null;
  birthDate?: string | null;
  visitedOn?: string | null;
  visitType?: string | null;
};

export type JoinTally = {
  /** 暫定の入会者数（名簿 ＋ 名簿に未反映の台帳） */
  total: number;
  /** 会員名簿から（確定） */
  roster: RosterJoin[];
  /** 受付台帳にあって名簿にまだ載っていない人（暫定） */
  pending: LedgerJoin[];
  /** 暫定分が含まれているか＝名簿の取込待ちがあるか */
  provisional: boolean;
};

/** 比較用の正規化（空白・中黒・句読点を落として小文字化） */
function normName(s: string | null | undefined): string {
  return String(s ?? "").replace(/[\s　・.,]/g, "").toLowerCase();
}

/** ひらがな→カタカナに寄せる（名簿とタブレット入力で表記がぶれるため） */
function normKana(s: string | null | undefined): string {
  return normName(s).replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

type Person = { name: string | null; nameKana?: string | null; birthDate?: string | null };

/** 同一人物とみなすか。生年月日が両方あって違えば別人（同姓同名よけ） */
export function samePerson(a: Person, b: Person): boolean {
  if (a.birthDate && b.birthDate && a.birthDate !== b.birthDate) return false;

  const an = normName(a.name);
  const bn = normName(b.name);
  if (an && bn && an === bn) return true;

  const ak = normKana(a.nameKana);
  const bk = normKana(b.nameKana);
  if (ak && bk && ak === bk) return true;

  return false;
}

/**
 * 名簿の入会者と受付台帳の入会者を突き合わせて、暫定の入会者数を出す。
 * 台帳側は同じ人が2行（体験で入会 → 別日にも入会と記録 等）でも1人として数える。
 */
export function tallyJoins(roster: RosterJoin[], ledger: LedgerJoin[]): JoinTally {
  const pending: LedgerJoin[] = [];

  for (const l of ledger) {
    if (!normName(l.name) && !normKana(l.nameKana)) continue; // 氏名なしは突き合わせられないので数えない
    if (roster.some((r) => samePerson(l, r))) continue;       // 名簿に反映済み
    if (pending.some((p) => samePerson(l, p))) continue;      // 台帳内の重複
    pending.push(l);
  }

  return {
    total: roster.length + pending.length,
    roster,
    pending,
    provisional: pending.length > 0,
  };
}
