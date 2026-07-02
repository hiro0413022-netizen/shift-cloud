# Workforce OS — API

規約は `/docs/genesis/API_STANDARD.md`。機能単位のドメイン関数一覧（Server Actionとして実装、Phase 6で`/api/v1`にも公開）。

## Phase 1
- staff: `createStaff` / `updateStaff` / `deactivateStaff` / `assignStore` / `setWage` / `assignRole`
- org: `createBrand` / `updateBrand` / `createStore` / `updateStore` / `updateCompanySettings`
- templates: `createShiftTemplate` / `updateShiftTemplate` / `deleteShiftTemplate`
- scheduleTypes: `createScheduleType` / `updateScheduleType` / `deleteScheduleType`

## Phase 2
- requests: `openRequestPeriod` / `closeRequestPeriod` / `submitShiftRequests`(一括) / `withdrawShiftRequest`
- notices: `createAnnouncement` / `createStoreEvent` / `markNotificationRead`

## Phase 3
- shifts: `saveDraftShifts`(一括upsert) / `publishShifts`(期間一括確定+通知) / `deleteShift`

## Phase 4
- kiosk: `registerKioskDevice` / `recordTime`(端末トークン認証) 
- attendance: `correctTimeRecord`(理由必須) / `recalculateAttendanceDay` / `confirmAttendanceDay`

## Phase 5
- payroll: `buildPayrollPeriod`(集計実行) / `lockPayrollPeriod` / `exportPayrollCsv`

## Phase 6
- suggestions: `createSuggestion`(AI/n8n用) / `approveSuggestion` / `rejectSuggestion` / `markSuggestionExecuted`
- hq: `getHqDashboard`(集計クエリ) / `compareStores`

## クエリ（読み取り、queries.ts）
`getMyDashboard` / `getMyShifts` / `getStoreShifts` / `getRequestsForBuilder` / `getAttendanceDays` / `getReconciliation` / `getPayrollItems` / `getAuditLogs`
