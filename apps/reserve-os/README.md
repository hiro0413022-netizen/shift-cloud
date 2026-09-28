# Reserve OS（公開フォームを member-os へ移設・#307）

- 公開のフィッティング申込フォーム `/reserve/<slug>` は **member-os の `/reserve/<slug>`** に移設（2026-09-29）。
- 旧 URL は `RESERVE_FORM_REDIRECT=on` で 308 転送（member-os 側に RESERVE_STAFF_EMAIL / RESERVE_FROM_EMAIL / RESEND_API_KEY / NEXT_PUBLIC_LIFF_ID を設定してから）。
- 受付一覧は Genesis `/reserve`。申込詳細（日程確定・電話台本）だけこのアプリに残る（退役予定）。
- Genesis の業務システム一覧からは外した。
