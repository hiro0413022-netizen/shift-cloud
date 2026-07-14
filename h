[33mcommit 17689364273d0f4375cee00511d839632de6eb4c[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mmain[m[33m, [m[1;31morigin/main[m[33m)[m
Author: hiro <hiro0413022@gmail.com>
Date:   Mon Jul 6 12:11:21 2026 +0900

    refactor(member-os): 体験受付をGenesisから独立アプリへ分離 (DECISIONS #27)

 CHANGELOG.md                                       |   6 [32m+[m
 NEXT_TASKS.md                                      |  10 [32m+[m[31m-[m
 apps/genesis/src/app/(main)/command/page.tsx       |  10 [32m+[m[31m-[m
 apps/genesis/src/app/(main)/inbox/actions.ts       |  88 [32m++++++++++[m
 apps/genesis/src/app/(main)/inbox/page.tsx         | 155 [32m+++++++++++++++++[m
 apps/genesis/src/components/sidebar.tsx            |   2 [32m+[m[31m-[m
 apps/genesis/src/lib/ceo-ai.ts                     |   6 [32m+[m
 apps/genesis/src/lib/secretary.ts                  | 142 [32m+++++++++++++++[m
 apps/genesis/src/middleware.ts                     |   2 [32m+[m[31m-[m
 apps/member-os/next.config.ts                      |   5 [32m+[m
 apps/member-os/package.json                        |  25 [32m+++[m
 apps/member-os/postcss.config.mjs                  |   1 [32m+[m
 .../src/app/(main)}/actions.ts                     |  23 [32m++[m[31m-[m
 apps/member-os/src/app/(main)/layout.tsx           |  12 [32m++[m
 .../members => member-os/src/app/(main)}/page.tsx  |   4 [32m+[m[31m-[m
 apps/member-os/src/app/api/logout/route.ts         |   8 [32m+[m
 apps/member-os/src/app/globals.css                 | 172 [32m++++++++++++++++++[m
 .../src/app/intake/[token]/actions.ts              |   0
 .../src/app/intake/[token]/intake-form.tsx         |   0
 .../src/app/intake/[token]/page.tsx                |   0
 apps/member-os/src/app/layout.tsx                  |  15 [32m++[m
 apps/member-os/src/app/login/actions.ts            |  24 [32m+++[m
 apps/member-os/src/app/login/page.tsx              |  43 [32m+++++[m
 apps/member-os/src/components/count-up.tsx         |  30 [32m++++[m
 apps/member-os/src/components/nav.tsx              |  20 [32m+++[m
 apps/member-os/src/components/ui.tsx               | 193 [32m+++++++++++++++++++++[m
 apps/member-os/src/lib/auth.ts                     |  61 [32m+++++++[m
 apps/{genesis => member-os}/src/lib/intake.ts      |   0
 apps/member-os/src/lib/kernel.ts                   |  56 [32m++++++[m
 apps/member-os/src/lib/supabase/admin.ts           |  14 [32m++[m
 apps/member-os/src/lib/supabase/server.ts          |  27 [32m+++[m
 apps/member-os/src/middleware.ts                   |  46 [32m+++++[m
 apps/member-os/tsconfig.json                       |  21 [32m+++[m
 .../src/app/(staff)/requests/actions.ts            |  24 [32m++[m[31m-[m
 apps/shift-cloud/src/app/(staff)/requests/page.tsx |  22 [32m++[m[31m-[m
 .../src/app/(staff)/requests/request-form.tsx      |  92 [32m++++++[m[31m----[m
 .../src/app/admin/kiosk-messages/actions.ts        |  19 [32m++[m
 .../src/app/admin/kiosk-messages/page.tsx          |  68 [32m++++++++[m
 apps/shift-cloud/src/app/admin/layout.tsx          |   1 [32m+[m
 apps/shift-cloud/src/app/admin/shifts/actions.ts   |  89 [32m++++++++[m[31m--[m
 apps/shift-cloud/src/app/admin/shifts/builder.tsx  | 161 [32m++++++++++++[m[31m-----[m
 apps/shift-cloud/src/app/admin/shifts/page.tsx     |  77 [32m++++[m[31m----[m
 .../src/app/admin/shifts/period-form.tsx           |  70 [32m++++++++[m
 .../src/app/admin/shifts/print/page.tsx            | 186 [32m++++++++++++++++++++[m
 .../src/app/admin/shifts/print/print-button.tsx    |  12 [32m++[m
 apps/shift-cloud/src/app/kiosk/[token]/actions.ts  |  26 [32m+++[m
 .../src/app/kiosk/[token]/kiosk-client.tsx         |  67 [32m++++++[m[31m-[m
 apps/shift-cloud/src/lib/util.ts                   |  24 [32m+++[m
 docs/genesis/DECISIONS.md                          |   1 [32m+[m
 docs/genesis/OPERATIONS.md                         |  18 [32m+[m[31m-[m
 supabase/migrations/0016_shift_flex.sql            |  55 [32m++++++[m
 supabase/migrations/0017_secretary_inbox.sql       |  65 [32m+++++++[m
 52 files changed, 2124 insertions(+), 174 deletions(-)
