// 配信停止（#111）。
//
// 特定電子メール法4条の「受信拒否の通知先」の実体。ログイン不要で、1クリックで完了すること。
// ここが手間だと、先方は代わりに「迷惑メール報告」を押す＝送信ドメインの信用が壊れる。
// だから確認画面を挟まず、開いた時点で停止する。

import { createAdmin } from "@yozan/core/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "配信停止", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdmin();

  const { data: msg } = await admin
    .from("out_messages")
    .select("id, company_id, to_email, prospect_id")
    .eq("unsub_token", token)
    .maybeSingle();

  let done = false;
  if (msg) {
    const email = (msg.to_email ?? "").toLowerCase();
    await admin
      .from("out_suppressions")
      .upsert({ company_id: msg.company_id, email, reason: "unsubscribed" }, { onConflict: "company_id,email" });
    if (msg.prospect_id) {
      await admin
        .from("dms_prospects")
        .update({ status: "lost", lost_reason: "配信停止のご希望" })
        .eq("id", msg.prospect_id);
    }
    done = true;
  }

  return (
    <main style={{ fontFamily: "system-ui,'Hiragino Sans','Noto Sans JP',sans-serif", maxWidth: 560, margin: "80px auto", padding: "0 24px", lineHeight: 1.9, color: "#1a1a17" }}>
      <p style={{ letterSpacing: "0.3em", fontSize: 11, color: "#a9863f", margin: "0 0 6px" }}>株式会社YOZAN</p>
      <h1 style={{ fontSize: 20, margin: "0 0 16px" }}>{done ? "配信を停止しました" : "リンクの有効期限が切れています"}</h1>
      {done ? (
        <>
          <p style={{ margin: "0 0 12px" }}>
            {msg?.to_email} 宛のご案内を停止しました。今後、当社からこのアドレスへ営業のご連絡をお送りすることはありません。
          </p>
          <p style={{ margin: 0, color: "#6b6b63", fontSize: 13 }}>
            ご不快な思いをおかけしていましたら申し訳ございませんでした。
            <br />
            お問い合わせ: info@yozan-group.jp
          </p>
        </>
      ) : (
        <p style={{ margin: 0, color: "#6b6b63", fontSize: 14 }}>
          お手数ですが info@yozan-group.jp までご連絡ください。確認のうえ、こちらで停止いたします。
        </p>
      )}
    </main>
  );
}
