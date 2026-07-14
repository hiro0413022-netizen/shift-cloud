"use client";
import { useFormState } from "react-dom";
import { createInquiryAction } from "../../../actions";

const initial = { error: null };

export default function InquiryForm({ projectId, channels }) {
  const [state, formAction] = useFormState(createInquiryAction, initial);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="card">
      <input type="hidden" name="projectId" value={projectId} />
      {state?.error && <div className="err">{state.error}</div>}
      <div className="cols2">
        <div>
          <label>会社／相手の名前 *</label>
          <input name="company" placeholder="例：〇〇ゴルフスクール" />
        </div>
        <div>
          <label>担当者名</label>
          <input name="contact" placeholder="例：山田 様" />
        </div>
      </div>
      <div className="cols2">
        <div>
          <label>電話番号</label>
          <input name="phone" />
        </div>
        <div>
          <label>メール</label>
          <input name="email" type="email" />
        </div>
      </div>
      <div className="cols2">
        <div>
          <label>経路（どこから来たか）</label>
          <select name="channelId" defaultValue="">
            <option value="">未選択</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label>問合せ日</label>
          <input name="inquiry_date" type="date" defaultValue={today} />
        </div>
      </div>
      <label>問い合わせ内容・メモ</label>
      <textarea name="note" placeholder="例：モニター検討中。ネット予約に興味あり。" />
      <button className="btn mt">登録する</button>
    </form>
  );
}
