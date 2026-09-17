import { PromoLibrary } from "@/components/promo-library";

/** 広報素材（ロゴ・写真・30秒までの動画）— スタッフ全員が見る・保存・共有・追加できる（#251） */
export const dynamic = "force-dynamic";

export default function PromoPage() {
  return <PromoLibrary variant="staff" />;
}
