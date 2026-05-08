-- ゴルフウィング発注管理システム サンプルデータ

-- 仕入先
INSERT INTO suppliers (name, contact_name, honorific, order_method, phone, email, payment_method, notes, shipping_rule) VALUES
('フジクラシャフト株式会社', '田中', '様', 'メール', '03-1234-5678', 'order@fujikura.co.jp', '月末締め翌月払い', '大口割引あり', '¥30,000以上送料無料'),
('グラファイトデザイン株式会社', '鈴木', '様', 'メール', '03-2345-6789', 'order@graphitedesign.jp', '月末締め翌月払い', '', '¥20,000以上送料無料'),
('三菱ケミカル株式会社', '佐藤', '様', 'FAX', '03-3456-7890', 'shaft@mitsubishi.co.jp', '月末締め翌月払い', '在庫確認必要', ''),
('UST Mamiya', '山田', '様', 'メール', '06-1234-5678', 'order@ustmamiya.jp', '都度払い', '', '送料実費'),
('アルディラジャパン', '高橋', '様', 'メール', '03-4567-8901', 'japan@aldilajapan.jp', '月末締め翌月払い', '', '¥15,000以上送料無料');

-- 仕入先判定ルール
INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes) VALUES
('シャフト', 'フジクラ', 'DR', 1, 0.55, 100, 'フジクラDR'),
('シャフト', 'フジクラ', 'FW', 1, 0.57, 100, 'フジクラFW'),
('シャフト', 'フジクラ', 'UT', 1, 0.57, 100, 'フジクラUT'),
('シャフト', 'フジクラ', 'IRON', 1, 0.60, 100, 'フジクラIRON'),
('シャフト', 'フジクラ', NULL, 1, 0.58, 200, 'フジクラ汎用'),
('シャフト', 'グラファイトデザイン', 'DR', 2, 0.54, 100, 'GDドライバー'),
('シャフト', 'グラファイトデザイン', 'FW', 2, 0.56, 100, 'GDFW'),
('シャフト', 'グラファイトデザイン', NULL, 2, 0.55, 200, 'GD汎用'),
('シャフト', '三菱ケミカル', 'DR', 3, 0.56, 100, '三菱DR'),
('シャフト', '三菱ケミカル', 'IRON', 3, 0.60, 100, '三菱アイアン'),
('シャフト', '三菱ケミカル', NULL, 3, 0.58, 200, '三菱汎用'),
('シャフト', 'UST Mamiya', NULL, 4, 0.57, 100, 'UST汎用'),
('シャフト', 'アルディラ', NULL, 5, 0.55, 100, 'アルディラ汎用'),
('シャフト', NULL, NULL, 1, 0.60, 999, 'デフォルト仕入先');

-- 商品マスタ
INSERT INTO products (barcode, item_category, manufacturer, name, spec, club_type, list_price, default_rate, default_supplier_id, unit, source, is_active) VALUES
('4901234567890', 'シャフト', 'フジクラ', 'VENTUS TR Black', '6X', 'DR', 55000, 0.55, 1, '本', 'マスタ', 1),
('4901234567891', 'シャフト', 'フジクラ', 'VENTUS TR Blue', '6S', 'DR', 50000, 0.55, 1, '本', 'マスタ', 1),
('4901234567892', 'シャフト', 'フジクラ', 'VENTUS TR Red', '6R', 'DR', 48000, 0.55, 1, '本', 'マスタ', 1),
('4901234567893', 'シャフト', 'フジクラ', 'SPEEDER NX Black', '6X', 'DR', 52000, 0.55, 1, '本', 'マスタ', 1),
('4901234567894', 'シャフト', 'フジクラ', 'SPEEDER NX Blue', '6S', 'FW', 50000, 0.57, 1, '本', 'マスタ', 1),
('4902345678901', 'シャフト', 'グラファイトデザイン', 'Tour AD DI', '6X', 'DR', 58000, 0.54, 2, '本', 'マスタ', 1),
('4902345678902', 'シャフト', 'グラファイトデザイン', 'Tour AD PT', '6S', 'DR', 56000, 0.54, 2, '本', 'マスタ', 1),
('4902345678903', 'シャフト', 'グラファイトデザイン', 'Tour AD IZ', '6X', 'DR', 60000, 0.54, 2, '本', 'マスタ', 1),
('4902345678904', 'シャフト', 'グラファイトデザイン', 'Tour AD CQ', '6S', 'FW', 52000, 0.56, 2, '本', 'マスタ', 1),
('4903456789012', 'シャフト', '三菱ケミカル', 'TENSEI CK Pro Orange', '6X', 'DR', 54000, 0.56, 3, '本', 'マスタ', 1),
('4903456789013', 'シャフト', '三菱ケミカル', 'TENSEI AV Raw White', '6S', 'DR', 52000, 0.56, 3, '本', 'マスタ', 1),
('4903456789014', 'シャフト', '三菱ケミカル', 'DIAMANA TB', '60S', 'DR', 56000, 0.56, 3, '本', 'マスタ', 1),
('4903456789015', 'シャフト', '三菱ケミカル', 'MMT 105', '105S', 'IRON', 48000, 0.60, 3, '本', 'マスタ', 1),
('4904567890123', 'シャフト', 'UST Mamiya', 'Recoil 780 ES SMACWRAP', 'F4', 'IRON', 42000, 0.57, 4, '本', 'マスタ', 1),
('4905678901234', 'シャフト', 'アルディラ', 'Synergy', '60S', 'DR', 46000, 0.55, 5, '本', 'マスタ', 1);

-- サンプル発注データ
INSERT INTO purchase_orders (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name, usage_type, requested_delivery_date, status, order_note, email_subject, email_body) VALUES
('20240601120000-abc123', 'PO-20240601-A1B2C', '2024-06-01', '古川', 1, '上田様', '取り寄せ', '2024-06-15', 'completed', '急ぎでお願いします', '【ゴルフウィング発注】PO-20240601-A1B2C フジクラシャフト株式会社', 'フジクラシャフト株式会社
田中様

いつもお世話になっております。ゴルフウィングです。
下記商品の発注をお願いいたします。

発注番号: PO-20240601-A1B2C
発注日: 2024-06-01
希望納期: 2024-06-15

- シャフト / フジクラ / VENTUS TR Black / 6X / DR / 数量:1 / 顧客:上田様 / 用途:取り寄せ

備考:
急ぎでお願いします'),
('20240605150000-def456', 'PO-20240605-D4E5F', '2024-06-05', '古川', 2, '鈴木様', '在庫用', '2024-06-20', 'ordered', '', '【ゴルフウィング発注】PO-20240605-D4E5F グラファイトデザイン株式会社', 'グラファイトデザイン株式会社
鈴木様

いつもお世話になっております。ゴルフウィングです。
下記商品の発注をお願いいたします。

発注番号: PO-20240605-D4E5F
発注日: 2024-06-05
希望納期: 2024-06-20

- シャフト / グラファイトデザイン / Tour AD DI / 6X / DR / 数量:2

備考:
特になし');

-- 発注明細
INSERT INTO purchase_order_items (purchase_order_id, product_id, item_category, manufacturer, product_name, spec, club_type, quantity, list_price, rate, unit_price, amount, customer_name, usage_type, requested_delivery_date) VALUES
(1, 1, 'シャフト', 'フジクラ', 'VENTUS TR Black', '6X', 'DR', 1, 55000, 0.55, 30250, 30250, '上田様', '取り寄せ', '2024-06-15'),
(2, 6, 'シャフト', 'グラファイトデザイン', 'Tour AD DI', '6X', 'DR', 2, 58000, 0.54, 31320, 62640, '鈴木様', '在庫用', '2024-06-20');

-- 納品データ（発注1は完納）
INSERT INTO receipts (purchase_order_id, received_date, slip_date, inspected_by, note) VALUES
(1, '2024-06-12', '2024-06-12', '古川', '');

INSERT INTO receipt_items (receipt_id, purchase_order_item_id, received_quantity) VALUES
(1, 1, 1);
