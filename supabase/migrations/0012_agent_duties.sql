-- 0012_agent_duties.sql
-- VISION §4「各AIは何を見て・何を判断して・何を実行するかまで定義する（並べるだけにしない）」
-- permissions jsonb = { watch: 見る, judge: 判断する, execute: 実行する(提案・下書きまで。実送信等は要承認) }

do $$
declare
  v_company uuid;
begin
  select id into v_company from companies limit 1;

  update ai_agents set permissions = duty.p::jsonb, updated_at = now()
  from (values
    ('ceo_ai', '{"watch":["全KPI","全モジュール","リスク/ブロッカー","承認待ち","イベント"],"judge":["優先順位","危険の検知","誰に何を任せるか"],"execute":["日次レポート生成","全体スコア算出","AI社員への指示案作成","判断リスト提示"]}'),
    ('dev_ai', '{"watch":["開発状況","ブロッカー","CHANGELOG","本番エラー"],"judge":["実装方針","リグレッションリスク"],"execute":["実装","GitHub Issue/PR作成","テスト実行","デプロイ準備（本番反映は要承認）"]}'),
    ('sales_ai', '{"watch":["体験予約数","入会率","法人リード","未入会の体験者"],"judge":["見込み度","アプローチ優先順位"],"execute":["提案書・掘り起こし文面の下書き（送信は要承認）"]}'),
    ('sns_ai', '{"watch":["SNS反応","問い合わせ数","体験予約の流入元"],"judge":["投稿テーマ","配信タイミング"],"execute":["Instagram/YouTube/LINE投稿案の作成（実投稿は要承認）"]}'),
    ('accounting_ai', '{"watch":["月次売上","営業利益","費用","資金繰り"],"judge":["異常な支出","利益率の変化"],"execute":["月次PL整理","経費精査レポート（支払・請求は要承認）"]}'),
    ('labor_ai', '{"watch":["勤怠","シフト","人件費率","残業"],"judge":["労基リスク","過剰/不足配置"],"execute":["シフト調整案","労務アラート（給与確定は要承認）"]}'),
    ('inventory_ai', '{"watch":["在庫数","発注状況","売れ筋"],"judge":["発注タイミング","過剰在庫"],"execute":["発注候補リスト作成（発注実行は要承認）"]}'),
    ('reservation_ai', '{"watch":["予約状況","空き枠","体験枠","稼働率"],"judge":["枠の過不足"],"execute":["リマインド文面・枠調整案（顧客通知は要承認）"]}'),
    ('recruit_ai', '{"watch":["応募状況","求人媒体の反応","人員の過不足"],"judge":["求人強化の要否"],"execute":["求人文作成","応募者管理・面接準備資料（応募者への連絡は要承認）"]}'),
    ('docs_ai', '{"watch":["会議・レポート・決定事項"],"judge":["資料化すべき情報"],"execute":["事業計画・提案資料・報告書・マニュアルの作成"]}'),
    ('lesson_ai', '{"watch":["レッスン履歴","受講者の課題"],"judge":["カリキュラムの適合"],"execute":["レッスン計画・上達メニュー案の作成"]}'),
    ('golf_coach_ai', '{"watch":["TrackManデータ","スイング傾向"],"judge":["改善ポイント"],"execute":["スイング改善提案・練習メニュー案の作成"]}'),
    ('store_ops_ai', '{"watch":["店舗別KPI","現場トラブル","顧客の声"],"judge":["店舗の異常検知"],"execute":["改善提案・現場向け指示案の作成"]}'),
    ('kallinos_ai', '{"watch":["EC売上","在庫回転","商品反応"],"judge":["商品企画の方向性"],"execute":["商品企画案・EC運営改善案（商品公開・価格変更は要承認）"]}'),
    ('rac_ai', '{"watch":["RAC/RC運営状況"],"judge":["運営上の課題"],"execute":["運営改善案・報告書の作成"]}'),
    ('cs_ai', '{"watch":["問い合わせ","クレーム","FAQヒット率"],"judge":["対応優先度","エスカレーション要否"],"execute":["一次対応文面の下書き（顧客への返信は要承認）"]}'),
    ('analyst_ai', '{"watch":["全KPIのトレンド","異常値"],"judge":["異常検知","予測の確度"],"execute":["KPI分析レポート","未来予測・シミュレーション案の作成"]}'),
    ('legal_ai', '{"watch":["契約書","規約","法令変更"],"judge":["法的リスクの有無"],"execute":["契約・規約のリスクチェックレポート（契約締結は要承認）"]}'),
    ('pm_ai', '{"watch":["タスク","進捗","ブロッカー"],"judge":["遅延リスク","依存関係"],"execute":["タスク整理","進捗レポート","ブロッカー解消計画の作成"]}')
  ) as duty(code, p)
  where ai_agents.company_id = v_company and ai_agents.code = duty.code;
end $$;
