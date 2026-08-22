/**
 * 動画の1コマ目を静止画（JPEG）に切り出す — ブラウザ専用（2026-08-22）
 *
 * なぜ要るか:
 *   カルテの動画一覧を「押す前から1コマ目が見えている」状態にするため。
 *   <video preload="metadata"> でも1コマ目は出るが、本数ぶん動画へリクエストが飛ぶ。
 *   現場は4G・1人20本超になるので、数十KBのJPEGだけ先に出して
 *   動画本体は押されるまで読まない（poster + preload="none"）。
 *
 * 失敗しても null を返すだけ。poster が無ければ従来どおり preload="metadata" に落ちる
 * （＝サムネのために登録が止まることは無い）。
 */

const MAX_EDGE = 640; // 一覧のサムネイルなのでこれで十分（20KB前後になる）

/** 動画（Blob/File）の指定秒の1コマをJPEG Blobにする。取れなければ null */
export async function capturePoster(source: Blob, atSec = 0.1): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(source);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      // 端末やコーデックによっては seek が返ってこないことがあるので必ず打ち切る
      const timer = setTimeout(() => resolve(null), 8000);
      const fail = () => { clearTimeout(timer); resolve(null); };

      const draw = () => {
        try {
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return fail();
          const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) return fail();
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (b) => { clearTimeout(timer); resolve(b); },
            "image/jpeg",
            0.72
          );
        } catch {
          fail();
        }
      };

      video.onerror = fail;
      video.onloadeddata = () => {
        // 0秒ちょうどは真っ黒なことがあるので少し進めてから描く
        const t = Math.min(atSec, Math.max(0, (video.duration || 1) - 0.05));
        if (Math.abs(video.currentTime - t) < 0.01) draw();
        else {
          video.onseeked = draw;
          video.currentTime = t;
        }
      };
    });
    return blob;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
