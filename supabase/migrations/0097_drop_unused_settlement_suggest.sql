-- ============================================================
-- 0097: 0096で作った suggest_expense_settlements を撤去する
--
-- 理由: 突合候補の判定は **TypeScript側（apps/money-golfwing/src/lib/settlement.ts）** に置いた。
--   ・単体テストで固定できる（tests/settlement.test.ts）
--   ・候補は「経費1件 → 支払候補」の向きで出す方が画面の作りに合う（SQL版は逆向きだった）
--   ・明細件数が小さい（確定出金 622件 / 未突合経費 数十件）ので、まとめて取ってJSで突合すれば足りる
--
-- 使われないSQL関数を残すと「どちらが正典か」が曖昧になる（#65 と同じ理由で削除する）。
-- ============================================================

drop function if exists suggest_expense_settlements(uuid, uuid);
