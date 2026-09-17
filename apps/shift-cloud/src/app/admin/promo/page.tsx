import { PageTitle } from "@/components/ui";
import { PromoLibrary } from "@/components/promo-library";

/** 管理画面の「広報素材」。中身はスタッフ画面 /promo と同じ（#251） */
export const dynamic = "force-dynamic";

export default function AdminPromoPage() {
  return (
    <>
      <PageTitle>広報素材</PageTitle>
      <PromoLibrary variant="admin" />
    </>
  );
}
