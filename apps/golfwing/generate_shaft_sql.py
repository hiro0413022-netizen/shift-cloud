#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
シャフト商品データをTSVからパースしてINSERT SQLを生成するスクリプト
"""
import re
import sys

def parse_price(price_str):
    """¥XX,XXX 形式の価格を数値に変換"""
    price_str = price_str.strip()
    # ¥ と , とスペースを除去
    cleaned = re.sub(r'[¥,\s]', '', price_str)
    try:
        return int(cleaned)
    except ValueError:
        return None

def extract_source_note(name_str):
    """商品名から備考（廃盤・在庫限り等）を抽出し、クリーンな名前と備考を返す"""
    name = name_str.strip()
    # 全角スペースや連続スペースを単一スペースに統一
    name = re.sub(r'[\u3000\s]+', ' ', name).strip()
    
    # 備考パターン: 廃盤、在庫限り、生産終了 など
    note_patterns = [
        r'\s*(廃盤)\s*$',
        r'\s*(在庫限り)\s*$',
        r'\s*(生産終了)\s*$',
        r'\s*(販売終了)\s*$',
        r'\s*(受注終了)\s*$',
    ]
    
    source = None
    for pattern in note_patterns:
        m = re.search(pattern, name)
        if m:
            source = m.group(1)
            name = name[:m.start()].strip()
            break
    
    return name, source

def escape_sql(s):
    """SQL文字列のシングルクォートをエスケープ"""
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"

def main():
    input_file = '/home/user/webapp/shaft_data.tsv'
    output_file = '/home/user/webapp/bulk_shaft_insert.sql'
    
    rows = []
    duplicates = set()
    
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # ヘッダ行スキップ
    header = lines[0].strip()
    print(f"ヘッダ: {header}")
    
    skipped = 0
    parsed = 0
    
    for i, line in enumerate(lines[1:], start=2):
        line = line.rstrip('\n')
        if not line.strip():
            continue
        
        parts = line.split('\t')
        if len(parts) < 4:
            print(f"警告: 行{i} フィールド不足 ({len(parts)}列): {line[:80]}")
            skipped += 1
            continue
        
        raw_name = parts[0]
        manufacturer = parts[1].strip()
        price_str = parts[2]
        club_type = parts[3].strip()
        
        # 商品名から備考を抽出
        name, source = extract_source_note(raw_name)
        
        # 価格をパース
        price = parse_price(price_str)
        if price is None:
            print(f"警告: 行{i} 価格パース失敗: '{price_str}'")
            skipped += 1
            continue
        
        # club_type バリデーション
        valid_club_types = {'DR', 'FW', 'UT'}
        if club_type not in valid_club_types:
            print(f"警告: 行{i} 不正なclob_type: '{club_type}'")
            skipped += 1
            continue
        
        # 重複チェック（name + manufacturer の組み合わせ）
        key = (name, manufacturer)
        if key in duplicates:
            print(f"重複スキップ: {name} / {manufacturer}")
            skipped += 1
            continue
        duplicates.add(key)
        
        rows.append({
            'name': name,
            'manufacturer': manufacturer,
            'list_price': price,
            'club_type': club_type,
            'source': source,
        })
        parsed += 1
    
    print(f"\n解析結果: {parsed}件 / スキップ: {skipped}件")
    
    # SQL生成
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- シャフト商品データ一括INSERT\n")
        f.write("-- 生成日時: 2026-05-09\n")
        f.write(f"-- 件数: {len(rows)}件\n\n")
        f.write("BEGIN TRANSACTION;\n\n")
        
        for row in rows:
            name_sql = escape_sql(row['name'])
            mfr_sql = escape_sql(row['manufacturer'])
            source_sql = escape_sql(row['source'])
            price = row['list_price']
            club_type = escape_sql(row['club_type'])
            
            sql = (
                f"INSERT OR IGNORE INTO products "
                f"(item_category, manufacturer, name, club_type, list_price, source, unit, is_active) "
                f"VALUES ('シャフト', {mfr_sql}, {name_sql}, {club_type}, {price}, {source_sql}, '本', 1);\n"
            )
            f.write(sql)
        
        f.write("\nCOMMIT;\n")
    
    print(f"SQLファイル出力完了: {output_file}")
    
    # 統計表示
    from collections import Counter
    by_manufacturer = Counter(r['manufacturer'] for r in rows)
    by_club_type = Counter(r['club_type'] for r in rows)
    has_source = sum(1 for r in rows if r['source'])
    
    print("\n=== メーカー別件数 ===")
    for mfr, cnt in sorted(by_manufacturer.items(), key=lambda x: -x[1]):
        print(f"  {mfr}: {cnt}件")
    
    print("\n=== 種類別件数 ===")
    for ct, cnt in sorted(by_club_type.items()):
        print(f"  {ct}: {cnt}件")
    
    print(f"\n備考あり（廃盤等）: {has_source}件")

if __name__ == '__main__':
    main()
