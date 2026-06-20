-- ローカル開発用 suppliersシードデータ
-- 本番DBからエクスポートしたデータ（tenant_id=1）
-- 0004マイグレーション実行前に適用すること

INSERT OR IGNORE INTO suppliers (id, name, email, phone, address, notes, order_method, shipping_rule) VALUES
(1, 'フジクラシャフト株式会社', 'order@fujikura.co.jp', '03-1234-5678', NULL, '大口割引あり', 'メール', '¥30,000以上送料無料'),
(2, 'グラファイトデザイン株式会社', 'https://direct.gd-inc.co.jp/login.php', '03-2345-6789', NULL, 'ログインid：s_furukawa@fine-d.co.jp / PASS：golfwinggd', 'web', '¥20,000以上送料無料'),
(3, '三菱ケミカル株式会社', 'shaft@mitsubishi.co.jp', '03-3456-7890', NULL, '在庫確認必要', 'FAX', ''),
(4, 'UST Mamiya', 'order@ustmamiya.jp', '06-1234-5678', NULL, '', 'メール', '送料実費'),
(5, 'アルディラジャパン', 'japan@aldilajapan.jp', '03-4567-8901', NULL, '', 'メール', '¥15,000以上送料無料'),
(6, 'テスト仕入先', 'test@example.com', '03-1234-5678', '', 'テスト', '', ''),
(7, '株式会社ワークス', 'y.komori@works-jp.com', '090-5397-3226', '', '2万5千円以内は送料別途', 'メール', '¥25,000以内送料別途'),
(8, '株式会社Hopeful', 'jun1.asai.34@gmail.com', '090-3477-9012', '', NULL, '', NULL),
(9, '株式会社ニューアートスポーツ', 'kamiya@crazy-shaft.com', '080-9182-0056', '', NULL, 'メール', NULL),
(10, '株式会社シンカグラファイト', 'staff@syncagraphite.co.jp', '090-9118-3388', '', '辻垣内社長：080-1027-7942 / 在庫確認：090-9118-3388 辻中様', 'メール', NULL),
(11, 'コンポジットテクノ株式会社', 'nakayama.compo@mbr.nifty.com', '090-6033-3349', '', '税込20,000未満 送料¥1,200', 'メール', '¥20,000未満 送料¥1,200'),
(12, '株式会社TRPX', 'kitayama@trpx.jp', '', '', '¥30,000未満 送料¥1,500', 'メール', '¥30,000未満 送料¥1,500'),
(13, 'REVE', 'office@reve-golf.com', '06-6864-6730', '', '手数料、送料別途', '電話', '送料・手数料別途'),
(14, '株式会社ラストストローク', 'y-yamamoto@olympic-co-ltd.jp', '090-2260-2668', '', 'y-yamamoto@olympic-co-ltd.jp / 在庫確認サイト: https://olympic-co-ltd.jp/golf/stock/g_login.php / ログイン:095428 / パスワード:095428', 'メール', NULL),
(15, '日本シャフト', NULL, NULL, NULL, NULL, 'メール', NULL),
(16, '朝日ゴルフ株式会社', 'callcenter@asahigolf.co.jp', '', '', '25,000以下は送料1,000円 / callcenter@asahigolf.co.jp', 'メール', '¥25,000以下 送料¥1,000'),
(17, 'アクシネットジャパン', 'Yudai_Hamada@acushnetgolf.com', '03-6890-0888', NULL, '目川様 070-1278-3426 / masaaki_egawa@acushnetgolf.com / ボール担当：船橋様 080-7499-1691 / Atsunobu_Funahashi@acushnetgolf.com', 'メール', NULL),
(18, '株式会社プーマジャパン', 'masahiro.fukumoto@cobrapuma.com', '070-7597-1893', '', NULL, 'メール', NULL),
(19, '株式会社ヤトゴルフ', 'hikoi@yatogolf.co.jp', '06-6441-2220', '', NULL, 'メール', NULL),
(20, '株式会社iomic', '', '080-8941-3330', '', '紙の注文票あり / ¥11,000未満送料別途', 'FAX', '¥11,000未満送料別途'),
(21, '株式会社STM', 't.kanayama@stmgolf.com', '090-5894-9332', '', '¥15,000以下送料別途', 'FAX/メール', '¥15,000以下送料別途'),
(22, '株式会社シンカグラファイト', 'staff@syncagraphite.co.jp', '', '', '紙の注文票あり / 20,000円以下送料別途', 'FAX', '¥20,000以下送料別途'),
(23, 'ヤトゴルフ（ZERO FIT）', 'hikoi@yatogolf.co.jp', '06-6441-2220', NULL, NULL, 'メール', NULL),
(24, 'エリートグリップ', NULL, NULL, NULL, '古川に連絡 / 20,000円未満送料別途', 'LINE', '¥20,000未満送料別途'),
(25, '山本プロ', '', '', '', '', '', ''),
(26, 'エリートグリップ', NULL, NULL, NULL, '古川に連絡 / 20,000円未満送料別途', 'LINE', '¥20,000未満送料別途'),
(27, 'ピンゴルフジャパン', '', '', NULL, '', '', NULL);
