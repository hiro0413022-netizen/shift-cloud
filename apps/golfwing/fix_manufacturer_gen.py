#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
空欄メーカー名を品名キーワードから推定してUPDATE SQLを生成するスクリプト
対象: products テーブルで manufacturer = '' OR NULL の全件
"""
import re
import json
import subprocess
import sys

# ============================================================
# ルール定義: (メーカー名, [キーワードリスト])
# 上から順に評価し、最初にマッチしたものを使用
# キーワードは大文字小文字を無視してマッチ（re.IGNORECASE）
# ============================================================

# --- シャフト系ルール ---
SHAFT_RULES = [
    # フジクラ
    ('フジクラ', [
        r'SPEEDER', r'VENTUS', r'TOUR SPEC', r'ROMBAX', r'MCI',
        r'ATTAS', r'Motore', r'BLUR', r'DIAMANA', r'Pro65',
        r'SPD NX', r'SPEEDER NX',
    ]),
    # USTマミヤ
    ('USTマミヤ', [
        r'ATTAS', r'PROFORCE', r'MAMIYA', r'Recoil', r'KUJOH',
        r'MOBIUS',
    ]),
    # グラファイトデザイン
    ('グラファイトデザイン', [
        r'Tour AD', r'Tour\s*AD', r'AD\s*DI', r'AD\s*IZ', r'AD\s*PT',
        r'AD\s*GP', r'AD\s*BB', r'AD\s*CQ', r'AD\s*EX', r'AD\s*MF',
        r'AD\s*TP', r'AD\s*VF', r'AD\s*WG', r'AD\s*XC',
        r'G7', r'G6', r'G5', r'G4',
    ]),
    # 三菱ケミカル
    ('三菱ケミカル', [
        r'DIAMANA', r'Bassara', r'FUBUKI', r'Tensei', r'KURO KAGE',
        r'Kurokage', r'MMT', r'OT\s*シャフト',
    ]),
    # 日本シャフト
    ('日本シャフト', [
        r'N\.S\.PRO', r'NS PRO', r'NSPRO', r'N\.S\. PRO',
        r'ZELOS', r'Modus', r'MODUS', r'950GH', r'950\s*GH',
        r'1150GH', r'1050GH', r'850GH', r'790GH', r'ZELOS\s*6', r'ZELOS\s*7',
        r'ZELOS\s*8', r'RB', r'HYBRID\s*125',
    ]),
    # 三菱ケミカル（テンセイ日本語表記含む）
    ('三菱ケミカル', [
        r'テンセイ', r'Tensei', r'TENSEI',
    ]),
    # トゥルーテンパー
    ('トゥルーテンパー', [
        r'Dynamic Gold', r'DG\s', r'Elevate', r'Elevate\s',
        r'Sensicore', r'Project X', r'PROJECT X', r'PX\s',
        r'XP 95', r'XP95', r'TT\s',
    ]),
    # マミヤ・オーピー（LOOPシリーズ）
    ('マミヤ・オーピー', [
        r'\bLOOP\b', r'LOOP\s', r'LOOP　',
    ]),
    # コンポジットテクノ（Fire Express / Fire Premium を先に判定）
    ('コンポジットテクノ', [
        r'Fire\s*Express', r'FIRE\s*EXPRESS',
        r'FireExpress',                    # スペースなし表記
        r'Fire[\s\u3000]*Premium',         # 全角スペース含む
        r'FIRE\s*PREMIUM',
        r'コンポジット',
        r'CT\s*シャフト', r'コンポジットテクノ',
    ]),
    # オリムピック（01α/01β/020等、ギリシャ文字シリーズを先に判定）
    ('オリムピック', [
        r'\b01α', r'\b01β', r'\b03β', r'\b03βL',
        r'\b020\s*D-', r'\b01\s*series\b', r'\b02\s*series\b', r'\b03\s*series\b',
        r'\b04\s*Premium\b', r'\b07\s*Premium\b', r'\b27\s*series\b',
        r'DR\s*03\s*series', r'DR03', r'DR 03',
    ]),
    # シンカグラファイト
    ('シンカグラファイト', [
        r'Fiamma2', r'Spada2', r'Zaffiro2', r'Leggero2',
        r'\bZ2\b', r'PROSPEC', r'Raffina', r'Zinger',
        r'\bMCH\b',
        r'BLACK[\s　]*50[\s　]*series',  # 全角スペース対応
        r'Black50', r'BLACK 50',
        r'FW Six TS',                      # シンカのFWシャフト
        r'\bα\b', r'\bβ\b', r'\bγ\b', r'\bδ\b',
        r'αⅡ', r'βⅡ', r'δⅡ',
        r'LEXIA L Series',
    ]),
    # グラヴィティ
    ('グラヴィティ', [
        r'Basileus', r'DAYTIONA', r'GRAVITY', r'\bLEXIA\b',
    ]),
    # デザインチューニング
    ('デザインチューニング', [
        r'ZERO SOLID', r'ZERO XROSS', r'ZERO APX', r'ZERO FW',
        r'\bZERO\b',
    ]),
    # ミンナニアウシャフト
    ('ミンナニアウシャフト', [
        r'WACCINE', r'ミンナニアウシャフト',
    ]),
    # NEWTON
    ('NEWTON', [
        r'秩父', r'NEWTON',
    ]),
    # OBAN
    ('OBAN', [
        r'\bOBAN\b',
    ]),
    # トライファス
    ('トライファス', [
        r'\bEDGE\b',
    ]),
    # リシャフト屋 / REMAX
    ('リシャフト屋', [
        r'リシャフト屋',
    ]),
    # グラファイトデザイン 追加
    ('グラファイトデザイン', [
        r'グラファイトデザイン',
    ]),
    # アルディラ
    ('アルディラ', [
        r'ALDILA', r'NV\s*\d', r'Ascent',
    ]),
    # クロムゾーン / ACCRA
    ('ACCRA', [
        r'\bACCRA\b',
    ]),
    # KBS
    ('KBS', [
        r'\bKBS\b', r'C-Taper', r'Tour\s*\$',
    ]),
    # クールクラブ / その他
]

# --- シャフト以外カテゴリ別ルール ---
OTHER_RULES = [
    # ======= TEE =======
    ('TOUR TEE', [
        r'TOUR TEE', r'Tour Tee', r'TORNADO TEE', r'トルネードティ',
    ]),

    # ======= ボール =======
    ('タイトリスト', [
        r'PRO V1', r'LEFT DASH', r'VELOCITY', r'TOUR SOFT', r'TOUR BXS',
        r'VELOITY',  # typoも対応
    ]),
    ('スリクソン', [
        r'SN ZST', r'ZSTXV', r'ZSTD',
    ]),
    ('ダンロップ', [
        r'TOUR SOFT', r'SRIXON',
    ]),
    ('ヤマハ', [
        r'\bXXIO\b',
    ]),

    # ======= グリップ =======
    ('ヨネックス', [
        r'\bY360', r'\bY361', r'ラッキースター', r'スティングレー',
        r'GeRON', r'GwRON', r'RS60', r'RS74', r'SX38', r'ペルリナ',
    ]),
    ('イオミック', [
        r'Sticky Evo', r'STICKY', r'イオミック',
    ]),
    ('渡辺グリップ', [
        r'WATANABE GRIP', r'渡辺グリップ',
    ]),
    ('278STD', [
        r'278STD',
    ]),

    # ======= グリップテープ =======
    ('NCA', [
        r'\bNCA\b', r'NCA両面', r'NCA\s*テープ',
    ]),

    # ======= グローブ =======
    ('タイトリスト', [
        r'ウェザーフィット', r'ピュアタッチ', r'プロフェッショナルテック',
    ]),

    # ======= シューズ =======
    ('フットジョイ', [
        r'\bFJ\b', r'FJ Traditions', r'フットジョイ', r'トラディションズ',
    ]),

    # ======= スリーブ =======
    ('カスタム', [
        r'\bCA-A3\b', r'\bCA-A4\b', r'\bMI-A1\b',
    ]),
    ('テーラーメイド', [
        r'DR 335', r'テーラーメイド用',
    ]),
    ('ピン', [
        r'G440', r'G430', r'G425',
    ]),

    # ======= ウエイト =======
    ('DR用ウエイト', [
        r'DR用\s*\d+g',
    ]),

    # ======= クラブ =======
    ('キャロウェイ', [
        r'PARADAYM', r'DARKSPEED', r'DARK SPEED', r'DS-ADAPT',
        r'ELYTE', r'Ai SMOKE', r'AI SMOKE', r'QI\d',
        r'QTM', r'APEX', r'OPTM',
    ]),
    ('テーラーメイド', [
        r'\bRTZ', r'STEALTH', r'SIM\s', r'M\d\b',  # RTZ\b→RTZ（全角°が続く場合も対応）
    ]),
    ('タイトリスト', [
        r'Vokey', r'VOKEY', r'SM10', r'ウェッジ SM',
    ]),
    ('ヤマハ', [
        r'XXIO PRIME', r'inpres',
    ]),
    ('ミズノ', [
        r'JPX-ONE', r'JPX\s', r'\bGT\d\b',
    ]),
    ('スリクソン', [
        r'zxi ', r'ｚｘｉ', r'ｽﾘｸｿﾝ',
    ]),

    # ======= ヘッド =======
    ('キャロウェイ', [
        r'DARKSPEED', r'DARK SPEED', r'DS-ADAPT', r'ELYTE', r'QI35',
        r'クアトロ β',
    ]),

    # ======= 帽子・キャップ =======
    ('タイトリスト', [
        r'Elite\s', r'ツアーエリート',
    ]),

    # ======= ウェア =======
    ('ヒートラブ', [
        r'ヒートラブ',
    ]),

    # ======= キャディーバッグ =======
    ('SYB', [
        r'SYB',
    ]),

    # ======= 練習器具 =======
    ('1 SPEED', [
        r'1\s*SPEED', r'1\s*speed', r'I PLANE', r'SPEED PLANE',
    ]),
    ('パイソン', [
        r'パイソン',
    ]),
    ('フットジョイ', [
        r'レインウェア', r'レインスーツ',
    ]),
    ('三角先生', [
        r'三角先生',
    ]),

    # ======= ソケット（工房部品・型番のみ） =======
    ('工房部品', [
        r'NI-0', r'PN-A', r'TM-U', r'WA-\d', r'BW-0', r'BWA-\d',
        r'CA-D', r'OW-0', r'BI-0', r'DP-[DI]', r'CA-F', r'OI-0', r'PN-U',
        r'W\d{4}[A-Z]',     # W3012A 等
        r'ウェッジ用$', r'ウッドソケット',
    ]),
    # ======= スリーブ（工房部品） =======
    ('工房部品', [
        r'リペア用スリーブ', r'リペア用\s*DR', r'ドライバー用$',
        r'テーラーメイドUT', r'TM-A\d', r'TI-A\d', r'FW用$',
    ]),
    # ======= 工具（工房部品） =======
    ('工房部品', [
        r'セル管', r'タングステンゴム', r'ベンジン', r'交換針',
        r'定番インチ伸ばし', r'インチ伸ばし', r'幅広$', r'鉛シート',
    ]),
    # ======= パター =======
    ('キャロウェイ', [
        r'ODYSSEY', r'オデッセイ',
    ]),
    ('タジオスタイル', [
        r'タジオスタイル',
    ]),
    # ======= キャップ（型番のみ） =======
    ('キャロウェイ', [
        r'^CAP-O-', r'^FC-O-', r'ODYSSEY',
    ]),
    # ======= ハドラス =======
    ('ハドラス', [
        r'ハドラス',
    ]),
    # ======= パターグリップ =======
    ('工房部品', [
        r'SO Charges', r'Putter$',
    ]),
    # ======= 工具 / セメダイン / グリップテープ =======
    ('NCA', [
        r'\bNCA\b',
    ]),
    ('セメダイン', [
        r'セメダイン', r'Y-610',
    ]),
    ('タイトリスト', [
        r'BWA-17',
    ]),
    ('グリップカッター', [
        r'グリップカッター', r'替刃',
    ]),

    # ======= ベルト =======
    ('タイトリスト', [
        r'TOUR Buckle Belt',
    ]),

    # ======= 計測器 =======
    ('ブッシュネル', [
        r'BN ピンシーカー', r'ピンシーカー',
    ]),

    # ======= ヘッドカバー / アクセサリー =======
    ('汎用', [
        r'DR用', r'コアフォース', r'ｺｱﾌｫｰｽ',
    ]),
]

# ============================================================
# DBからデータ取得
# ============================================================
def fetch_empty_products():
    cmd = [
        'npx', 'wrangler', 'd1', 'execute', 'golfwing-production',
        '--local',
        '--command',
        "SELECT id, name, item_category FROM products WHERE manufacturer = '' OR manufacturer IS NULL ORDER BY item_category, name",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, cwd='/home/user/webapp')
    output = result.stdout + result.stderr
    m = re.search(r'\[.*\]', output, re.DOTALL)
    if not m:
        print("ERROR: DB出力からJSONを取得できませんでした", file=sys.stderr)
        print(output[:500], file=sys.stderr)
        sys.exit(1)
    data = json.loads(m.group())
    return data[0]['results']

# ============================================================
# メーカー推定ロジック
# ============================================================
def guess_manufacturer(name: str, category: str) -> str | None:
    """品名とカテゴリからメーカーを推定。不明はNoneを返す"""
    # シャフトはSHAFT_RULESを優先
    if category == 'シャフト':
        rule_list = SHAFT_RULES
    else:
        rule_list = OTHER_RULES + SHAFT_RULES  # 念のためシャフトルールもフォールバック

    for manufacturer, patterns in rule_list:
        for pat in patterns:
            if re.search(pat, name, re.IGNORECASE):
                return manufacturer
    return None

# ============================================================
# SQL生成
# ============================================================
def escape_sql(s):
    return "'" + s.replace("'", "''") + "'"

def main():
    print("DBから空欄メーカー商品を取得中...")
    products = fetch_empty_products()
    print(f"  対象件数: {len(products)}件\n")

    updates = []   # (id, name, category, guessed_mf)
    unknowns = []  # 推定不可

    for p in products:
        pid  = p['id']
        name = p['name']
        cat  = p['item_category']
        mf   = guess_manufacturer(name, cat)
        if mf:
            updates.append((pid, name, cat, mf))
        else:
            unknowns.append((pid, name, cat))

    print(f"推定成功: {len(updates)}件 / 推定不可: {len(unknowns)}件")

    # カテゴリ別サマリ
    from collections import Counter
    by_cat_ok  = Counter(c for _, _, c, _ in updates)
    by_cat_ng  = Counter(c for _, _, c in unknowns)
    by_mf      = Counter(m for _, _, _, m in updates)

    print("\n=== 推定成功 カテゴリ別 ===")
    for cat, cnt in sorted(by_cat_ok.items()):
        print(f"  {cat}: {cnt}件")

    print("\n=== 推定メーカー別 ===")
    for mf, cnt in sorted(by_mf.items(), key=lambda x: -x[1]):
        print(f"  {mf}: {cnt}件")

    if unknowns:
        print(f"\n=== 推定不可 ({len(unknowns)}件) ===")
        for pid, name, cat in unknowns[:50]:
            print(f"  [{cat}] id={pid} {name}"[:100])
        if len(unknowns) > 50:
            print(f"  ... 他{len(unknowns)-50}件")

    # SQL出力
    out_file = '/home/user/webapp/fix_manufacturer.sql'
    with open(out_file, 'w', encoding='utf-8') as f:
        f.write("-- メーカー名空欄修正 UPDATE SQL\n")
        f.write(f"-- 生成件数: {len(updates)}件\n")
        f.write(f"-- 推定不可: {len(unknowns)}件\n")
        f.write("-- 生成日時: 2026-05-09\n\n")
        f.write("BEGIN TRANSACTION;\n\n")

        for pid, name, cat, mf in updates:
            mf_sql = escape_sql(mf)
            f.write(f"UPDATE products SET manufacturer = {mf_sql} WHERE id = {pid}; -- [{cat}] {name[:60]}\n")

        f.write("\nCOMMIT;\n")

    print(f"\n✅ SQLファイル出力完了: {out_file} ({len(updates)}件)")

if __name__ == '__main__':
    main()
