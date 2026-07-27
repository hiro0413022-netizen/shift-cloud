/**
 * 配信HTMLに差し込む計測ビーコン。
 *
 * 方針:
 *  - 配信時に差し込む（保存済みHTMLは書き換えない）。既存の成果物も再生成なしで計測対象になる
 *  - 失敗しても中身の表示を絶対に壊さない（全部 try/catch・エラーは握る）
 *  - 個人情報は送らない。滞在秒は「タブが見えている間」だけ数える
 *  - ハッシュルーティング（#/services 等）のページ移動を page イベントで拾う
 */

export type BeaconOptions = {
  /** 記録APIのパス（同一オリジン）。例: "/api/track" */
  endpoint: string;
  /** 配信トークン */
  token: string;
  /** 社内プレビュー（営業担当が自分で開いた分）＝集計から除外 */
  internal?: boolean;
  /** ハートビート間隔（秒）。既定15 */
  heartbeatSeconds?: number;
};

/** ビーコンの <script> タグ文字列を返す */
export function trackingSnippet(options: BeaconOptions): string {
  const cfg = JSON.stringify({
    endpoint: options.endpoint,
    token: options.token,
    internal: Boolean(options.internal),
    hb: Math.max(5, options.heartbeatSeconds ?? 15),
  });

  return `<script data-yozan-track="1">(function(){try{
var C=${cfg};
var KEY='yz_trk_'+C.token;
var sk=null;
try{sk=sessionStorage.getItem(KEY);}catch(e){}
if(!sk){sk=(Date.now().toString(36)+Math.random().toString(36).slice(2,10));try{sessionStorage.setItem(KEY,sk);}catch(e){}}
var seconds=0,lastTick=Date.now(),sent=0;
var device=(matchMedia&&matchMedia('(max-width: 767px)').matches)?'mobile':'desktop';
function page(){try{return (location.hash||'#/').slice(0,120);}catch(e){return null;}}
function post(kind,label,useBeacon){
  var body=JSON.stringify({token:C.token,sessionKey:sk,kind:kind,page:page(),label:label||null,
    seconds:Math.round(seconds),internal:C.internal,
    meta:{referrer:(document.referrer||'').slice(0,300),ua:(navigator.userAgent||'').slice(0,300),device:device}});
  try{
    if(useBeacon&&navigator.sendBeacon){navigator.sendBeacon(C.endpoint,new Blob([body],{type:'application/json'}));return;}
    fetch(C.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){});
  }catch(e){}
}
function tick(){
  var now=Date.now();
  if(document.visibilityState!=='hidden'){seconds+=(now-lastTick)/1000;}
  lastTick=now;
  if(seconds-sent>=C.hb){sent=seconds;post('heartbeat');}
}
post('open');
setInterval(tick,1000);
window.addEventListener('hashchange',function(){tick();post('page');});
document.addEventListener('visibilitychange',function(){tick();if(document.visibilityState==='hidden'){post('heartbeat',null,true);}});
window.addEventListener('pagehide',function(){tick();post('heartbeat',null,true);});
}catch(e){}})();</script>`;
}

/**
 * HTMLにビーコンを差し込む。
 * すでに差し込み済み（data-yozan-track）の場合は何もしない。
 */
export function injectTracking(html: string, options: BeaconOptions): string {
  if (!html) return html;
  if (html.includes("data-yozan-track")) return html;
  const snippet = trackingSnippet(options);
  const i = html.lastIndexOf("</body>");
  if (i >= 0) return html.slice(0, i) + snippet + html.slice(i);
  return html + snippet;
}
