(function () {
  "use strict";

  var parser = globalThis.JobFitBossParser;
  globalThis.JobFitBossCollector = {
    collect: function () {
      if (!parser || typeof parser.extractPage !== "function") {
        return { ok: false, jobs: [], reason: "职位解析器加载失败，请重新加载扩展后重试。" };
      }
      return parser.extractPage(document, location);
    }
  };
})();
