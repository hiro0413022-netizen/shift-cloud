/* FRANK GOLF CMS 読み込み (#85 §3-1)
   Genesisの /site-admin で編集した内容を公開APIから取得し、window.FRANK に上書きして再描画する。
   APIが落ちていても静的な site-data.js の値でそのまま表示される（安全設計）。 */
(function () {
  var API = "https://yozan-genesis.vercel.app/api/public/site/frank-golf";
  function merge(dst, src) {
    Object.keys(src || {}).forEach(function (k) {
      var v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v) && dst[k] && typeof dst[k] === "object" && !Array.isArray(dst[k])) {
        merge(dst[k], v);
      } else {
        dst[k] = v;
      }
    });
  }
  try {
    fetch(API).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || !window.FRANK) return;
      merge(window.FRANK, j.data || {});
      if (Array.isArray(j.news) && j.news.length > 0) window.FRANK.news = j.news;
      if (typeof window.FRANK_RENDER === "function") window.FRANK_RENDER();
    }).catch(function () {});
  } catch (e) {}
})();
