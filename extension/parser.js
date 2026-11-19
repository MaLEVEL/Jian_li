(function (root, factory) {
  "use strict";
  var api = factory();
  root.ZhiqiYunfanBossParser = api;
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NOW = function () { return new Date().toISOString(); };
  var SALARY_RE = /(?:\d+(?:\.\d+)?\s*[-~—至]\s*\d+(?:\.\d+)?\s*[kK千万]|\d+(?:\.\d+)?\s*[kK千万](?:\s*[·xX*]\s*\d+\s*薪)?|面议|薪资面议)/;
  var EXPERIENCE_RE = /(?:在校生|应届生|经验不限|\d+\s*[-~—至]\s*\d+\s*年|\d+\s*年(?:以上|以内)?|无经验)/;
  var EDUCATION_RE = /(?:学历不限|初中及以下|中专\/中技|中专|高中|大专|本科|硕士|博士|MBA\/EMBA)/;
  var CITY_RE = /^(?:北京|上海|天津|重庆|广州|深圳|杭州|南京|苏州|成都|武汉|西安|长沙|郑州|青岛|厦门|合肥|宁波|东莞|佛山|珠海|无锡|济南|福州|大连|沈阳|昆明|南昌|南宁|贵阳|石家庄|太原|哈尔滨|长春|海口|兰州|乌鲁木齐|香港|澳门|台北)(?:[·\-\s].*)?$/;
  var JOB_ID_RE = /\/job_detail\/([^/?#]+)\.html/i;
  var META_RE = new RegExp(SALARY_RE.source + "|" + EXPERIENCE_RE.source + "|" + EDUCATION_RE.source, "i");

  function clean(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function oneLine(value) {
    return clean(value).replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    var seen = Object.create(null);
    return values.filter(function (value) {
      var key = oneLine(value);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    }).map(oneLine);
  }

  function absoluteUrl(href, baseUrl) {
    if (!href) return "";
    try {
      return new URL(href, baseUrl || "https://www.zhipin.com/").href;
    } catch (_) {
      return "";
    }
  }

  function pageUrl(locationLike) {
    if (!locationLike) return "";
    if (typeof locationLike === "string") return locationLike;
    return locationLike.href || "";
  }

  function queryAll(rootNode, selectors) {
    if (!rootNode || typeof rootNode.querySelectorAll !== "function") return [];
    var found = [];
    selectors.forEach(function (selector) {
      if (!selector || selector === ":scope") return;
      try {
        rootNode.querySelectorAll(selector).forEach(function (node) { found.push(node); });
      } catch (_) {
        // A newer or browser-specific selector must not stop the remaining fallbacks.
      }
    });
    return found;
  }

  function firstNode(rootNode, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var node = rootNode && rootNode.querySelector(selectors[i]);
        if (node) return node;
      } catch (_) {
        // Try the next semantic selector.
      }
    }
    return null;
  }

  function nodeText(node) {
    if (!node) return "";
    return clean(typeof node.innerText === "string" ? node.innerText : node.textContent);
  }

  function textFrom(rootNode, selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      var node = firstNode(rootNode, [selectors[i]]);
      var text = oneLine(nodeText(node));
      if (text) return text;
    }
    return "";
  }

  function attrFrom(rootNode, selectors, attribute) {
    for (var i = 0; i < selectors.length; i += 1) {
      var node = firstNode(rootNode, [selectors[i]]);
      var value = node && typeof node.getAttribute === "function" ? node.getAttribute(attribute) : "";
      if (value) return clean(value);
    }
    return "";
  }

  function isVisible(node) {
    if (!node || typeof node.closest !== "function") return true;
    if (node.closest("[hidden], [aria-hidden='true']")) return false;
    var view = typeof window !== "undefined" ? window : null;
    if (view && typeof view.getComputedStyle === "function") {
      var style = view.getComputedStyle(node);
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
    }
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    return true;
  }

  function jobIdFrom(node, url) {
    var direct = node && typeof node.getAttribute === "function"
      ? (node.getAttribute("data-jobid") || node.getAttribute("data-job-id"))
      : "";
    if (direct) return direct;
    var href = attrFrom(node, ["a[href*='/job_detail/']", "a[href*='job_detail']"], "href");
    var match = href.match(JOB_ID_RE) || String(url || "").match(JOB_ID_RE);
    return match ? match[1] : "";
  }

  function classifyMeta(text, job) {
    var value = oneLine(text);
    if (!value) return;
    if (SALARY_RE.test(value) && !job.salary) {
      job.salary = value;
      return;
    }
    if (EXPERIENCE_RE.test(value) && !job.experience) {
      job.experience = value;
      return;
    }
    if (EDUCATION_RE.test(value) && !job.education) {
      job.education = value;
      return;
    }
    if (CITY_RE.test(value) && !job.location) job.location = value;
  }

  function collectTags(card, job) {
    var explicit = queryAll(card, [
      ".job-keyword-list li",
      ".job-keyword-list span",
      ".job-tags span",
      ".job-tags li",
      "[class*='job-keyword'] li",
      "[class*='job-keyword'] span"
    ]).map(nodeText);
    var generic = queryAll(card, [
      ".tag-list li",
      ".tag-list span",
      ".job-info span",
      ".job-info li"
    ]).map(nodeText);
    generic.forEach(function (text) { classifyMeta(text, job); });
    job.tags = unique(explicit.concat(generic.filter(function (text) {
      var value = oneLine(text);
      return value && !META_RE.test(value) && !CITY_RE.test(value) && !/^(招聘者|HR|在线|刚刚活跃|今日活跃|昨日活跃)$/.test(value);
    })));
  }

  function cardCandidate(node, baseUrl) {
    if (!node || !isVisible(node)) return null;
    if (typeof node.closest === "function" && node.closest("script, style, noscript, [class*='chat'], [class*='message']")) return null;
    var detailLink = firstNode(node, ["a[href*='/job_detail/']", "a[href*='job_detail']"]);
    var href = detailLink && detailLink.getAttribute("href");
    var directJobId = typeof node.getAttribute === "function"
      ? (node.getAttribute("data-jobid") || node.getAttribute("data-job-id"))
      : "";
    if (!href && !directJobId) return null;
    var sourceUrl = absoluteUrl(href, baseUrl);
    var title = textFrom(node, [".job-name", ".job-title", "[class*='job-title']", "a[href*='/job_detail/']"]);
    var company = textFrom(node, [".company-name", ".company-title", "[class*='company-name']", "[class*='company-title']"]);
    if (!title || !company) return null;

    var job = {
      source_job_id: jobIdFrom(node, sourceUrl),
      source_url: sourceUrl,
      company: company,
      title: title,
      location: textFrom(node, [".job-area", ".job-location", "[class*='job-area']", "[class*='job-location']"]),
      salary: textFrom(node, [".salary", ".job-salary", "[class*='salary']"]),
      experience: "",
      education: "",
      description: "",
      recruiter_name: "",
      recruiter_title: "",
      tags: []
    };
    collectTags(node, job);
    if (!job.source_url && job.source_job_id) {
      job.source_url = "https://www.zhipin.com/job_detail/" + job.source_job_id + ".html";
    }
    return job;
  }

  function findCardNodes(rootNode) {
    var candidates = queryAll(rootNode, [
      ".job-list-box .job-card-wrapper",
      ".job-card-wrapper",
      ".job-card-box",
      "li[data-jobid]",
      "li[data-job-id]",
      "[class*='job-card-wrapper']",
      "[class*='job-card-box']"
    ]);
    queryAll(rootNode, ["a[href*='/job_detail/']", "a[href*='job_detail']"]).forEach(function (anchor) {
      if (typeof anchor.closest !== "function") return;
      var container = anchor.closest(".job-card-wrapper, .job-card-box, li[data-jobid], li[data-job-id], [class*='job-card']");
      if (container) candidates.push(container);
    });
    var seen = [];
    return candidates.filter(function (node) {
      if (!node || seen.indexOf(node) !== -1) return false;
      seen.push(node);
      return true;
    });
  }

  function isDetailPage(url) {
    return /\/job_detail\//i.test(String(url || ""));
  }

  function detailRoot(rootNode) {
    var candidates = queryAll(rootNode, [
      ".job-detail-box",
      ".job-detail-container",
      ".job-detail-content",
      ".job-detail-section",
      ".job-detail",
      "[class*='job-detail-box']",
      "[class*='job-detail-container']",
      "[class*='job-detail-content']"
    ]);
    var best = null;
    var bestScore = -1;
    candidates.forEach(function (candidate) {
      if (!isVisible(candidate)) return;
      if (typeof candidate.closest === "function" && candidate.closest("script, style, [class*='chat'], [class*='message']")) return;
      var description = textFrom(candidate, [".job-sec-text", ".job-detail-section .text", "[class*='job-sec-text']", "[class*='description']"]);
      var score = description.length + (firstNode(candidate, [".job-name", ".job-detail-title", "[class*='job-title']"]) ? 1000 : 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    });
    return best;
  }

  function detailCandidate(rootNode, baseUrl, detectedRoot) {
    var scoped = detectedRoot || detailRoot(rootNode);
    if (!scoped) return null;
    var description = textFrom(scoped, [
      ".job-sec-text",
      ".job-detail-section .text",
      ".job-detail-content [class*='description']",
      "[class*='job-sec-text']"
    ]);
    var title = textFrom(scoped, [".job-name", ".job-detail-title", ".job-detail-info .name", "[class*='job-title']"]);
    var company = textFrom(scoped, [".company-name", ".company-info .name", ".company-title", "[class*='company-name']"]);
    if (!description || (!title && !company)) return null;

    var metaTexts = queryAll(scoped, [".job-info li", ".job-info span", ".job-info .text", "[class*='job-info'] li", "[class*='job-info'] span"]).map(nodeText);
    var job = {
      source_job_id: jobIdFrom(scoped, baseUrl),
      source_url: absoluteUrl(attrFrom(scoped, ["a[href*='/job_detail/']"], "href"), baseUrl) || (isDetailPage(baseUrl) ? baseUrl : ""),
      company: company,
      title: title,
      location: textFrom(scoped, [".job-area", ".job-location", ".job-detail-info [class*='location']", "[class*='job-area']"]),
      salary: textFrom(scoped, [".salary", ".job-salary", "[class*='salary']"]),
      experience: "",
      education: "",
      description: description,
      recruiter_name: textFrom(scoped, [".job-boss-info .name", ".boss-name", ".recruiter-info .name", "[class*='boss-info'] [class*='name']"]),
      recruiter_title: textFrom(scoped, [".job-boss-info .position", ".boss-title", ".recruiter-title", "[class*='boss-info'] [class*='position']"]),
      tags: []
    };
    metaTexts.forEach(function (text) { classifyMeta(text, job); });
    job.tags = unique(queryAll(scoped, [
      ".job-keyword-list li",
      ".job-keyword-list span",
      ".job-tags span",
      "[class*='job-keyword'] li",
      "[class*='job-keyword'] span"
    ]).map(nodeText));
    return job;
  }

  function mergeMissing(target, source) {
    Object.keys(target).forEach(function (key) {
      if (key === "tags") {
        target.tags = unique((target.tags || []).concat(source.tags || []));
      } else if (!target[key] && source[key]) {
        target[key] = source[key];
      }
    });
    return target;
  }

  function applyDetail(jobs, detail) {
    if (!detail) return jobs;
    var match = detail.source_job_id && jobs.find(function (job) { return job.source_job_id === detail.source_job_id; });
    if (!match) {
      match = jobs.find(function (job) {
        return oneLine(job.title) === oneLine(detail.title) && (!detail.company || oneLine(job.company) === oneLine(detail.company));
      });
    }
    if (!match && jobs.length === 1) match = jobs[0];
    if (!match) {
      var active = jobs.find(function (job) { return job.__active; });
      if (active) match = active;
    }
    if (match) {
      mergeMissing(match, detail);
      delete match.__active;
      return jobs;
    }
    if (detail.title || detail.company) {
      delete detail.__active;
      jobs.push(detail);
    }
    return jobs;
  }

  function markActive(nodes, jobs, url) {
    var activeSelectors = [".active", ".selected", "[aria-selected='true']", "[aria-current]"];
    nodes.forEach(function (node) {
      var isActive = activeSelectors.some(function (selector) {
        if (typeof node.matches === "function" && node.matches(selector)) return true;
        return !!firstNode(node, [selector]);
      });
      if (!isActive) return;
      var card = cardCandidate(node, url);
      if (!card) return;
      var job = jobs.find(function (candidate) {
        return card.source_job_id && candidate.source_job_id === card.source_job_id;
      }) || jobs.find(function (candidate) {
        return candidate.title === card.title && candidate.company === card.company;
      });
      if (job) job.__active = true;
    });
  }

  function finalize(jobs, url) {
    var fetchedAt = NOW();
    return jobs.map(function (job) {
      delete job.__active;
      return {
        source_job_id: clean(job.source_job_id),
        source_url: clean(job.source_url) || clean(url),
        company: oneLine(job.company),
        title: oneLine(job.title),
        location: oneLine(job.location),
        salary: oneLine(job.salary),
        experience: oneLine(job.experience),
        education: oneLine(job.education),
        description: clean(job.description),
        recruiter_name: oneLine(job.recruiter_name),
        recruiter_title: oneLine(job.recruiter_title),
        tags: unique(job.tags || []),
        fetched_at: fetchedAt
      };
    });
  }

  function extractPage(documentLike, locationLike) {
    var url = pageUrl(locationLike);
    if (!documentLike || typeof documentLike.querySelectorAll !== "function") {
      return { ok: false, jobs: [], reason: "页面 DOM 不可用，无法读取当前职位。" };
    }
    if (url && !/^https:\/\/www\.zhipin\.com\//i.test(url)) {
      return { ok: false, jobs: [], reason: "请先主动打开 https://www.zhipin.com 的职位搜索页或详情页。" };
    }

    var nodes = isDetailPage(url) ? [] : findCardNodes(documentLike);
    var jobs = nodes.map(function (node) { return cardCandidate(node, url); }).filter(Boolean);
    markActive(nodes, jobs, url);
    var detectedDetailRoot = detailRoot(documentLike);
    if (isDetailPage(url) && !detectedDetailRoot) {
      return {
        ok: false,
        jobs: [],
        reason: "当前详情页没有检测到可靠的职位详情容器，已停止采集以避免读取聊天或消息内容。"
      };
    }
    var detail = detailCandidate(documentLike, url, detectedDetailRoot);
    applyDetail(jobs, detail);
    jobs = jobs.filter(function (job) { return job.title && job.company; });
    var deduped = [];
    var seen = Object.create(null);
    jobs.forEach(function (job) {
      var key = job.source_job_id || [oneLine(job.title), oneLine(job.company), oneLine(job.location)].join("|");
      if (!seen[key]) {
        seen[key] = true;
        deduped.push(job);
      }
    });
    var output = finalize(deduped, url);
    if (!output.length) {
      return {
        ok: false,
        jobs: [],
        reason: "当前页面没有检测到可靠的可见职位。请打开 BOSS 搜索结果或职位详情，等待内容加载完成后重试。"
      };
    }
    return { ok: true, jobs: output, reason: "" };
  }

  return {
    extractPage: extractPage,
    clean: clean,
    oneLine: oneLine,
    classifyMeta: classifyMeta
  };
});
