import { requireCtx } from "@/lib/ctx";
import InquiryForm from "./form";

export default async function NewInquiryPage() {
  const { supa, projectId, project } = await requireCtx();
  const { data: channels } = await supa
    .from("channels").select("*").eq("project_id", projectId).eq("is_active", true).order("sort");

  return (
    <div style={{ maxWidth: 640 }}>
      <h1>問い合わせ受付</h1>
      <p className="muted small mb">{project?.name} の新しい問い合わせを登録します。登録すると案件が作られ、最初の段階に入ります。</p>
      <InquiryForm projectId={projectId} channels={channels || []} />
    </div>
  );
}
