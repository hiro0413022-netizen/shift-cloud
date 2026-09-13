// swing_record.js — スイングを「動画」で録る
//
// ■ なぜ静止画をためる方式をやめたか
//
// 骨格推定に合わせて1コマずつJPEGにしていたので、貯まる速さが推定の速さに
// 縛られていた。推定が遅い機械では毎秒8コマしか残らず、再生がカクカクになる。
// 映像を残すのに骨格推定を待つ理由はどこにもない。
//
// ■ 代わりにすること
//
// MediaRecorder でカメラの出力をそのまま録る。カメラが30fpsなら30コマ、
// 120fpsなら120コマが等間隔で入る。再生は <video> に任せるので滑らか。
// 骨格は**撮り終わったあとにコマ送りで**取る（実時間の制約がないので、
// 重いモデルを使えるし、コマを落とさない）。
//
// ■ 巻き戻して切り出せないので、区間を回す
//
// webm は途中から切り出すのが難しい。そこで一定時間ごとに録り直し、
// 「ひとつ前の完成した区間」と「いま録っている区間」の2本を持つ。
// スイングが終わったとき、その全体を含むほうを採る。

/**
 * 動画の長さを確定させてから返す。
 *
 * MediaRecorder が作った webm は、**長さがヘッダに書かれていない**。
 * そのまま duration を読むと Infinity が返り、時間を指定した頭出しが全部きかない。
 * いったん終端の先まで飛ばすと本当の長さが分かる（Chrome の既知の癖）。
 * ここを踏まないと、再生も解析も切り出しも動かない。
 */
export function loadedDuration(v){
  return new Promise(res=>{
    let done = false;
    const finish = ()=>{ if(!done){ done=true; res(v.duration); } };
    const probe = ()=>{
      if(isFinite(v.duration) && v.duration > 0) return finish();
      const onDur = ()=>{
        if(isFinite(v.duration) && v.duration > 0){
          v.removeEventListener('durationchange', onDur);
          try{ v.currentTime = 0; }catch(e){}
          finish();
        }
      };
      v.addEventListener('durationchange', onDur);
      try{ v.currentTime = 1e6; }catch(e){}
    };
    if(v.readyState >= 1) probe();
    else v.addEventListener('loadedmetadata', probe, {once:true});
    setTimeout(finish, 6000);
  });
}

export class SegmentRecorder {
  /**
   * @param {MediaStream} stream
   * @param {object} opt  {segmentMs, mimeType, bitsPerSecond}
   */
  constructor(stream, opt={}){
    this.stream = stream;
    this.segmentMs = opt.segmentMs ?? 12000;
    this.bps = opt.bitsPerSecond ?? 8_000_000;
    this.mime = opt.mimeType || SegmentRecorder.pickMime();
    this.rec = null;
    this.chunks = [];
    this.segStart = 0;              // performance.now
    this.prev = null;               // {blob, start, end}
    this.timer = 0;
    this.running = false;
    this.error = '';
  }

  static pickMime(){
    // 対応している形の中から、素直に再生できるものを選ぶ
    // **H.264 を先に選ぶ。** VP9/VP8 はブラウザが CPU で圧縮するので、
    // 1920x1200 を3台ぶん回すと、そこで詰まってコマが落ちる。
    // H.264 はグラフィックボードの専用回路（NVENC など）に回るため、
    // CPU がほとんど空く。再生も同じブラウザでそのままできる。
    const cands = [
      'video/mp4;codecs=avc1.640028',   // H.264 High（新しめの Chrome/Edge）
      'video/mp4;codecs=avc1.42E01E',   // H.264 Baseline
      'video/mp4',
      'video/webm;codecs=h264',         // 中身は H.264、容れ物だけ webm
      'video/webm;codecs=vp8',          // VP9 より軽い方を先に
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    for(const m of cands){
      if(window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  start(){
    if(this.running) return;
    this.running = true;
    this._startSegment();
  }

  _startSegment(){
    try{
      this.chunks = [];
      this.segStart = performance.now();
      this.rec = new MediaRecorder(this.stream,
        this.mime ? {mimeType:this.mime, videoBitsPerSecond:this.bps}
                  : {videoBitsPerSecond:this.bps});
      this.rec.ondataavailable = e=>{ if(e.data && e.data.size) this.chunks.push(e.data); };
      this.rec.onerror = e=>{ this.error = String(e.error||e); };
      this.rec.start(500);           // 0.5秒ごとに小分けで受け取る
      clearTimeout(this.timer);
      this.timer = setTimeout(()=>this._rotate(), this.segmentMs);
    }catch(e){
      this.error = String(e);
      this.running = false;
    }
  }

  // いまの区間を閉じて「ひとつ前」にし、新しい区間を始める
  _rotate(){
    if(!this.rec || this.rec.state === 'inactive'){ this._startSegment(); return; }
    const start = this.segStart, end = performance.now();
    const chunks = this.chunks;
    this.rec.onstop = ()=>{
      if(chunks.length) this.prev = {blob:new Blob(chunks, {type:this.mime}), start, end};
      if(this.running) this._startSegment();
    };
    try{ this.rec.stop(); }catch(e){ this._startSegment(); }
  }

  stop(){
    this.running = false;
    clearTimeout(this.timer);
    try{ if(this.rec && this.rec.state !== 'inactive') this.rec.stop(); }catch(e){}
    this.rec = null;
  }

  /**
   * [t0, t1] を含む区間を取り出す。
   *
   * 全部を含む区間があればそれを返す。無ければ、**いちばん見たい瞬間**
   * （must＝ふつうはインパクト）が入っている区間で妥協する。
   * カメラを開いた直後などは、まだ区間が短くて全部は入らない。
   * そこで丸ごと捨てると「撮ったのに何も出ない」になるので、入るところまで返す。
   *
   * @returns {{blob, start, end, mime}|null}
   *   start/end は、その動画が録られていた**実時刻**（performance.now の値）
   */
  async take(t0, t1, must){
    const key = (must==null) ? t0 : must;
    // いま録っている区間
    if(this.running && this.segStart <= key){
      const seg = await this._closeCurrent();
      if(seg) return {...seg, mime:this.mime};
    }
    // ひとつ前の区間
    if(this.prev && this.prev.start <= key && this.prev.end >= key){
      return {blob:this.prev.blob, start:this.prev.start,
              end:this.prev.end, mime:this.mime};
    }
    return null;
  }

  _closeCurrent(){
    return new Promise(res=>{
      if(!this.rec || this.rec.state === 'inactive'){ res(null); return; }
      const start = this.segStart, chunks = this.chunks;
      this.rec.onstop = ()=>{
        const end = performance.now();
        const blob = chunks.length ? new Blob(chunks, {type:this.mime}) : null;
        if(blob) this.prev = {blob, start, end};
        if(this.running) this._startSegment();
        res(blob ? {blob, start, end} : null);
      };
      try{ this.rec.stop(); }catch(e){ res(null); }
    });
  }

  get held(){
    // いま何秒ぶん持っているか（目安）
    const cur = this.running ? (performance.now()-this.segStart)/1000 : 0;
    const prev = this.prev ? (this.prev.end-this.prev.start)/1000 : 0;
    return {cur, prev, bytes:this.chunks.reduce((a,c)=>a+c.size,0)
                        + (this.prev? this.prev.blob.size : 0)};
  }
}

/**
 * 録った区間から、必要なところだけを切り出して短い動画にする。
 *
 * ■ なぜ要るか
 * 区間は10秒ぶん録っている。スイングは1.5秒しかないのに、そのまま保存すると
 * 1本あたり10秒×台数になる。「容量はすぐ埋まる」ので、保存するのは要るところだけにする。
 *
 * ■ どうやるか
 * webm は途中から切り出すのが難しい。そこで**その区間だけを再生しながら録り直す**。
 * 1.5秒の再生に1.5秒かかるが、保存を押したときの一度きりなので問題にならない。
 * うまくいかない環境（captureStream が無いなど）では、元のまま保存して先へ進む。
 *
 * @returns {Promise<Blob|null>} 切り出せなければ null
 */
export async function trimClip(url, startSec, endSec, opt={}){
  const bps = opt.bitsPerSecond ?? 6_000_000;
  const mime = opt.mimeType || SegmentRecorder.pickMime();
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try{
    const dur = await loadedDuration(v);
    if(!isFinite(dur) || dur <= 0) return null;
    if(!v.captureStream && !v.mozCaptureStream) return null;
    const a = Math.max(0, Math.min(startSec, dur));
    const b = Math.max(a + 0.1, Math.min(endSec, dur));
    await new Promise(res=>{ v.onseeked = res; v.currentTime = a;
                             setTimeout(res, 2000); });
    const st = v.captureStream ? v.captureStream() : v.mozCaptureStream();
    const chunks = [];
    const rec = new MediaRecorder(st,
      mime ? {mimeType:mime, videoBitsPerSecond:bps} : {videoBitsPerSecond:bps});
    rec.ondataavailable = e=>{ if(e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise(res=>{ rec.onstop = res; });
    rec.start(200);
    await v.play();
    await new Promise(res=>{
      const tick = ()=>{
        if(v.currentTime >= b || v.ended) return res();
        requestAnimationFrame(tick);
      };
      tick();
      setTimeout(res, (b-a)*1000 + 3000);   // 念のための打ち切り
    });
    v.pause();
    try{ rec.stop(); }catch(e){}
    await done;
    return chunks.length ? new Blob(chunks, {type:mime}) : null;
  }catch(e){
    return null;
  }finally{
    try{ v.pause(); v.removeAttribute('src'); v.load(); }catch(e){}
  }
}
