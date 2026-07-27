/**
 * 【廃止】旧 予約システム（res_resources / res_bookings）の共通ロジック — #93
 *
 * 予約システムが2つあったため、台帳を frunk_bays / frunk_bookings に一本化しました（0084）。
 * 営業時間・枠の作り方・会計ラベルは **@yozan/core/frank-booking** が正典です。
 * スタッフ画面から台帳を読むときは **@/lib/frank-reservation** を使ってください。
 *
 * このファイルは、間違って古い定義を使わないように空にしてあります。
 */
export {};
