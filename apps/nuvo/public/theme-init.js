// 첫 페인트 전에 테마 적용 (깜빡임 방지)
// + 랜딩(/)이 아닌 화면에서는 index.html에 미리 넣은 정적 랜딩을 숨긴다 (seo/plugin.ts)
(function () {
  if (location.pathname !== "/") document.documentElement.dataset.route = "app";
})();
(function () {
  try {
    var t = localStorage.getItem("nuvo-theme");
    if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    var a = localStorage.getItem("nuvo-accent");
    if (a === "sage" || a === "slate") document.documentElement.dataset.accent = a;
  } catch (e) {}
})();
