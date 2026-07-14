// 業種別デモテンプレート — 毎回ゼロから作らないための「型」。
// 営業先ごとに DemoBrief（実データ・指示）で上書きし、空欄はここの仮データ（※仮）で埋める。
// 同じ見た目の使い回しに見えないよう、業種ごとに配色・構成・語彙・ヒーロー表現を変えている。

import type { DemoBrief, IndustryKey } from "./types";

export interface IndustryTemplate {
  key: IndustryKey;
  label: string;
  palette: { primary: string; dark: string; soft: string; accent: string };
  heroEmoji: string;
  vocab: {
    services: string; // 「診療案内」「施術案内」等
    hours: string; // 「診療時間」「受付時間」
    firstVisit: string; // 「初めての方へ」等
    patients: string; // 「患者さま」「飼い主さま」
  };
  defaults: Required<
    Pick<DemoBrief, "tagline" | "intro" | "services" | "strengths" | "firstVisit" | "hoursRows" | "hoursNote" | "reserveNote">
  >;
}

const WEEK_HEAD = ["", "月", "火", "水", "木", "金", "土", "日祝"];
const rows = (am: string, pm: string, amMarks: string[], pmMarks: string[]): string[][] => [
  WEEK_HEAD,
  [am, ...amMarks],
  [pm, ...pmMarks],
];
const STD_AM = rows("9:00〜12:00", "16:00〜19:00", ["●", "●", "●", "●", "●", "●", "休"], ["●", "●", "休", "●", "●", "休", "休"]);

export const TEMPLATES: Record<IndustryKey, IndustryTemplate> = {
  naika: {
    key: "naika",
    label: "内科",
    palette: { primary: "#1d6fb8", dark: "#14528a", soft: "#eef5fb", accent: "#3fa9f5" },
    heroEmoji: "🩺",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "初めて受診される方へ", patients: "患者さま" },
    defaults: {
      tagline: "地域のかかりつけ医として、\nひとりひとりに寄り添う診療を。",
      intro: "風邪や生活習慣病から健康診断まで、日々の健康の入り口となる診療を行っています。気になる症状はどんな小さなことでもご相談ください。（※仮文章）",
      services: [
        { name: "一般内科", desc: "発熱・咳・腹痛など、日常のご不調を幅広く診療します。" },
        { name: "生活習慣病", desc: "高血圧・糖尿病・脂質異常症の継続的な管理を行います。" },
        { name: "健康診断・予防接種", desc: "各種健診、インフルエンザ等の予防接種に対応します。" },
      ],
      strengths: ["地域密着のかかりつけ医", "丁寧な説明と継続的なフォロー", "検査から専門医紹介までの連携"],
      firstVisit: ["健康保険証（マイナ保険証）をお持ちください", "お薬手帳・紹介状があればご持参ください", "受付→問診→診察→お会計の流れです"],
      hoursRows: STD_AM,
      hoursNote: "※受付は診療終了の15分前まで／休診日：水曜午後・土曜午後・日祝（※仮）",
      reserveNote: "お電話でご予約いただけます。直接のご来院も受け付けています。",
    },
  },
  dental: {
    key: "dental",
    label: "歯科",
    palette: { primary: "#0e9aa7", dark: "#0b7680", soft: "#ecf8f9", accent: "#59c1cb" },
    heroEmoji: "🦷",
    vocab: { services: "診療メニュー", hours: "診療時間", firstVisit: "初診の方へ", patients: "患者さま" },
    defaults: {
      tagline: "「痛くなる前に通う」を、\nこの街のあたりまえに。",
      intro: "むし歯・歯周病の治療だけでなく、予防を中心としたお口の健康管理をご提案しています。痛みや通院回数に配慮した診療を心がけています。（※仮文章）",
      services: [
        { name: "一般歯科", desc: "むし歯・歯周病治療。できるだけ削らない・抜かない治療方針です。" },
        { name: "予防歯科・クリーニング", desc: "定期検診とプロによるクリーニングで再発を防ぎます。" },
        { name: "小児歯科", desc: "お子さまが歯医者を嫌いにならない、やさしい診療を。" },
      ],
      strengths: ["予防中心の診療方針", "痛みに配慮した治療", "土曜も診療（※仮）"],
      firstVisit: ["保険証をお持ちください", "痛みが強い場合はお電話ください。当日対応をご案内します", "初回はお口全体の検査とカウンセリングを行います"],
      hoursRows: STD_AM,
      hoursNote: "※休診日：木曜・日祝（※仮）",
      reserveNote: "お電話またはWebからご予約ください。急な痛みはお電話が確実です。",
    },
  },
  ortho: {
    key: "ortho",
    label: "整形外科",
    palette: { primary: "#2b6cb0", dark: "#1f4f82", soft: "#edf4fb", accent: "#68a5e8" },
    heroEmoji: "🦴",
    vocab: { services: "診療案内", hours: "診療・リハビリ受付時間", firstVisit: "初めて受診される方へ", patients: "患者さま" },
    defaults: {
      tagline: "痛みの原因に向き合い、\n動けるからだを取り戻す。",
      intro: "腰痛・膝の痛み・肩こりから骨折・スポーツ外傷まで。診断からリハビリテーションまで一貫して対応します。（※仮文章）",
      services: [
        { name: "整形外科一般", desc: "腰・膝・肩・首の痛み、しびれ、外傷の診断と治療。" },
        { name: "リハビリテーション", desc: "理学療法士による運動器リハビリ（※仮）。" },
        { name: "骨粗しょう症", desc: "骨密度測定と予防・治療の継続管理。" },
      ],
      strengths: ["画像診断に基づく説明", "リハビリ設備", "高齢の方も通いやすい導線"],
      firstVisit: ["保険証をお持ちください", "他院の画像・紹介状があればご持参ください", "痛みの経過をメモしておくとスムーズです"],
      hoursRows: STD_AM,
      hoursNote: "※リハビリの受付時間は診療時間と異なる場合があります（※仮）",
      reserveNote: "受付順の診療です。リハビリは予約制（※仮）。",
    },
  },
  pediatrics: {
    key: "pediatrics",
    label: "小児科",
    palette: { primary: "#e8833a", dark: "#c2661f", soft: "#fdf3ea", accent: "#f6b26b" },
    heroEmoji: "🧸",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "はじめての受診の方へ", patients: "お子さまと保護者の方" },
    defaults: {
      tagline: "子どもの「いつもと違う」に、\nいちばん近くで応える小児科。",
      intro: "お子さまの体調不良はご家族にとって大きな不安です。症状の見立てとご家庭でのケアまで、分かりやすくお伝えします。（※仮文章）",
      services: [
        { name: "小児科一般", desc: "発熱・咳・鼻水・腹痛など、お子さまの症状全般。" },
        { name: "乳幼児健診", desc: "成長・発達の確認と育児のご相談。" },
        { name: "予防接種", desc: "定期・任意接種のスケジュール相談から接種まで。" },
      ],
      strengths: ["保護者への丁寧な説明", "感染症の方と分けた待合（※仮）", "予防接種・健診の専用時間帯（※仮）"],
      firstVisit: ["母子手帳・保険証・医療証をお持ちください", "熱の経過や症状のメモがあると診察がスムーズです", "予防接種は事前予約をお願いします"],
      hoursRows: STD_AM,
      hoursNote: "※14:00〜15:00は健診・予防接種専用時間帯（※仮）",
      reserveNote: "お電話でご予約ください。順番待ち状況もお電話でご案内します。",
    },
  },
  derma: {
    key: "derma",
    label: "皮膚科",
    palette: { primary: "#c05b76", dark: "#9c3f58", soft: "#faeef2", accent: "#e393a9" },
    heroEmoji: "🌿",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "初診の方へ", patients: "患者さま" },
    defaults: {
      tagline: "肌の悩みに、\n根拠のある答えを。",
      intro: "湿疹・アトピー・ニキビ・じんましんなど、皮膚のトラブル全般を診療します。原因と治療方針を分かりやすくご説明します。（※仮文章）",
      services: [
        { name: "皮膚科一般", desc: "湿疹・かぶれ・水虫・イボ・じんましん等。" },
        { name: "アトピー性皮膚炎", desc: "継続的なスキンケア指導と治療。" },
        { name: "小児皮膚科", desc: "お子さまの肌トラブルにも対応します。" },
      ],
      strengths: ["説明の丁寧さ", "スキンケア指導", "皮膚外科的処置にも対応（※仮）"],
      firstVisit: ["保険証をお持ちください", "使用中の塗り薬・飲み薬があればご持参ください", "患部の写真（経過）があると診察に役立ちます"],
      hoursRows: STD_AM,
      hoursNote: "※休診日：木曜・日祝（※仮）",
      reserveNote: "受付順の診療です。混雑状況はお電話でご確認いただけます。",
    },
  },
  eye: {
    key: "eye",
    label: "眼科",
    palette: { primary: "#4a5fc1", dark: "#36479a", soft: "#eff1fb", accent: "#8b9be8" },
    heroEmoji: "👁",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "初めて受診される方へ", patients: "患者さま" },
    defaults: {
      tagline: "見える毎日を、\nこれからもずっと。",
      intro: "目の疲れ・かすみ・視力低下から、白内障・緑内障の管理まで。生活の質を支える目の健康を守ります。（※仮文章）",
      services: [
        { name: "眼科一般", desc: "結膜炎・ドライアイ・眼精疲労・花粉症等。" },
        { name: "白内障・緑内障", desc: "定期検査による早期発見と継続管理。" },
        { name: "コンタクト・メガネ処方", desc: "初めての方の処方・定期チェック。" },
      ],
      strengths: ["検査機器による丁寧な診断（※仮）", "手術が必要な場合の連携先", "コンタクト処方の通いやすさ"],
      firstVisit: ["保険証をお持ちください", "使用中のメガネ・コンタクトをご持参ください", "散瞳検査の場合は当日の運転をお控えください"],
      hoursRows: STD_AM,
      hoursNote: "※手術日・検査日は受付時間が変わります（※仮）",
      reserveNote: "受付順の診療です。コンタクト処方は受付終了30分前までにお越しください。",
    },
  },
  ent: {
    key: "ent",
    label: "耳鼻咽喉科",
    palette: { primary: "#3a8f7d", dark: "#2b6e60", soft: "#edf7f4", accent: "#72c2b0" },
    heroEmoji: "👂",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "初めて受診される方へ", patients: "患者さま" },
    defaults: {
      tagline: "耳・鼻・のどの不調に、\n確かな診断を。",
      intro: "中耳炎・花粉症・副鼻腔炎・めまい・いびきまで。お子さまからご高齢の方まで幅広く診療します。（※仮文章）",
      services: [
        { name: "耳鼻咽喉科一般", desc: "耳・鼻・のどの症状全般。お子さまの中耳炎も。" },
        { name: "アレルギー性鼻炎・花粉症", desc: "内服・点鼻から舌下免疫療法まで（※仮）。" },
        { name: "めまい・補聴器相談", desc: "検査に基づく診断とご相談。" },
      ],
      strengths: ["内視鏡による分かりやすい説明（※仮）", "お子さまの診療に慣れたスタッフ", "花粉症の継続治療"],
      firstVisit: ["保険証をお持ちください", "お薬手帳があればご持参ください", "順番受付システムをご利用いただけます（※仮）"],
      hoursRows: STD_AM,
      hoursNote: "※休診日：水曜午後・日祝（※仮）",
      reserveNote: "Webの順番受付、またはお電話でどうぞ。",
    },
  },
  beauty: {
    key: "beauty",
    label: "美容クリニック",
    palette: { primary: "#8d6a9f", dark: "#6d4f7d", soft: "#f6f0f9", accent: "#c9a6d9" },
    heroEmoji: "✨",
    vocab: { services: "メニュー", hours: "診療時間", firstVisit: "初めてご来院の方へ", patients: "お客さま" },
    defaults: {
      tagline: "なりたい自分に、\n医療の力で丁寧に近づく。",
      intro: "カウンセリングを大切に、一人ひとりの肌質・ご希望に合わせた施術をご提案します。無理な勧誘は行いません。（※仮文章）",
      services: [
        { name: "医療脱毛", desc: "肌質に合わせた機器選定と照射プラン（※仮）。" },
        { name: "スキンケア治療", desc: "シミ・くすみ・ニキビ跡へのレーザー・ピーリング等。" },
        { name: "注入治療", desc: "ボトックス・ヒアルロン酸によるエイジングケア。" },
      ],
      strengths: ["カウンセリング重視", "明朗な料金表示", "プライバシーに配慮した院内動線（※仮）"],
      firstVisit: ["カウンセリングは無料です（※仮）", "当日の施術も可能な場合があります", "お化粧を落とすスペースをご用意しています"],
      hoursRows: [WEEK_HEAD, ["10:00〜19:00", "●", "●", "●", "●", "●", "●", "●"]],
      hoursNote: "※完全予約制／不定休（※仮）",
      reserveNote: "Web予約・LINE・お電話からご予約いただけます。",
    },
  },
  vet: {
    key: "vet",
    label: "動物病院",
    palette: { primary: "#3f8f4f", dark: "#2f6e3c", soft: "#eef7ef", accent: "#7cc28a" },
    heroEmoji: "🐾",
    vocab: { services: "診療案内", hours: "診療時間", firstVisit: "初めてご来院の方へ", patients: "飼い主さま" },
    defaults: {
      tagline: "ことばを話せない家族のために、\nできることを、ぜんぶ。",
      intro: "ワクチンや健康診断などの予防医療から、体調不良時の診療まで。大切な家族の一生に寄り添う動物病院です。（※仮文章）",
      services: [
        { name: "一般診療（犬・猫）", desc: "体調不良・皮膚・お腹の不調など日常の診療全般。" },
        { name: "予防医療", desc: "混合ワクチン・狂犬病予防・フィラリア/ノミダニ予防。" },
        { name: "健康診断", desc: "年齢に合わせた健診コースで病気の早期発見を。" },
      ],
      strengths: ["丁寧なインフォームドコンセント", "犬猫それぞれに配慮した待合（※仮）", "夜間・救急時の連携案内（※仮）"],
      firstVisit: [
        "初診の方は、ワクチン証明書があればご持参ください",
        "キャリーバッグまたはリードの着用をお願いします",
        "便・尿の異常があれば、採取してお持ちいただくと検査がスムーズです",
        "駐車場あり。車内でお待ちいただくことも可能です（※仮）",
      ],
      hoursRows: STD_AM,
      hoursNote: "※休診日：日曜午後・祝日（※仮）／手術・往診は昼の時間帯に行います",
      reserveNote: "お電話でのご予約が確実です。急患はその旨お電話ください。",
    },
  },
  judo: {
    key: "judo",
    label: "接骨院・整骨院",
    palette: { primary: "#b3742a", dark: "#8d5a1e", soft: "#faf3e9", accent: "#dda75c" },
    heroEmoji: "💪",
    vocab: { services: "施術案内", hours: "受付時間", firstVisit: "初めての方へ", patients: "患者さま" },
    defaults: {
      tagline: "その痛み、\n我慢しないでください。",
      intro: "急なケガ（捻挫・打撲・肉離れ）から慢性的な腰痛・肩こりまで。原因を見極め、一人ひとりに合わせた施術を行います。（※仮文章）",
      services: [
        { name: "保険施術", desc: "捻挫・打撲・挫傷など急性のケガ（健康保険適用）。" },
        { name: "手技療法・骨格調整", desc: "腰痛・肩こり・姿勢の乱れへのアプローチ。" },
        { name: "交通事故施術", desc: "むちうち等。自賠責保険の手続きもサポートします。" },
      ],
      strengths: ["国家資格者による施術", "夜まで受付・土曜も営業（※仮）", "交通事故対応の実績"],
      firstVisit: ["保険証をお持ちください（急性のケガの場合）", "動きやすい服装でお越しください（お着替えもあります）", "初回はカウンセリングと状態チェックから始めます"],
      hoursRows: [WEEK_HEAD, ["9:00〜12:30", "●", "●", "●", "●", "●", "●", "休"], ["15:00〜20:00", "●", "●", "●", "●", "●", "休", "休"]],
      hoursNote: "※土曜は14:00まで／休診日：日祝（※仮）",
      reserveNote: "予約優先制。お電話またはLINEからどうぞ（※仮）。",
    },
  },
  other: {
    key: "other",
    label: "その他",
    palette: { primary: "#4f46e5", dark: "#3b34b0", soft: "#efeefb", accent: "#8781ee" },
    heroEmoji: "🏥",
    vocab: { services: "サービス案内", hours: "営業時間", firstVisit: "初めての方へ", patients: "お客さま" },
    defaults: {
      tagline: "地域に選ばれる理由が、\nここにあります。",
      intro: "サービスの特徴や想いを、ここに掲載します。（※仮文章）",
      services: [
        { name: "サービス1", desc: "内容の説明（※仮）。" },
        { name: "サービス2", desc: "内容の説明（※仮）。" },
        { name: "サービス3", desc: "内容の説明（※仮）。" },
      ],
      strengths: ["強み1（※仮）", "強み2（※仮）", "強み3（※仮）"],
      firstVisit: ["ご来店の流れ（※仮）"],
      hoursRows: [WEEK_HEAD, ["10:00〜18:00", "●", "●", "●", "●", "●", "●", "休"]],
      hoursNote: "※休業日：日祝（※仮）",
      reserveNote: "お電話またはWebからご予約ください。",
    },
  },
};

export function getTemplate(key: string): IndustryTemplate {
  return TEMPLATES[(key in TEMPLATES ? key : "other") as IndustryKey];
}
