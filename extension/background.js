"use strict";

const DEFAULT_SERVER_URL = "http://127.0.0.1:18001";

function isTrustedHostname(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".ts.net") || host.endsWith(".local")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 127
    || parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

function normalizeServerUrl(value) {
  const raw = String(value || DEFAULT_SERVER_URL).trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error("服务地址格式无效，请填写类似 http://127.0.0.1:18001 的地址。");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || !isTrustedHostname(parsed.hostname)) {
    throw new Error("服务地址必须是本机、可信局域网或 Tailscale 私有地址。");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("服务地址不能包含账号、查询参数或锚点。");
  }
  return parsed.href.replace(/\/+$/, "");
}

function endpoint(serverUrl, path) {
  return normalizeServerUrl(serverUrl) + path;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return { message: text.slice(0, 500) };
  }
}

function pickNumber(body, keys) {
  if (!body || typeof body !== "object") return null;
  for (const key of keys) {
    if (typeof body[key] === "number" && Number.isFinite(body[key])) return body[key];
  }
  if (body.data && typeof body.data === "object") {
    for (const key of keys) {
      if (typeof body.data[key] === "number" && Number.isFinite(body.data[key])) return body.data[key];
    }
  }
  if (body.result && typeof body.result === "object") {
    for (const key of keys) {
      if (typeof body.result[key] === "number" && Number.isFinite(body.result[key])) return body.result[key];
    }
  }
  return null;
}

function serviceError(body, status) {
  if (!body) return `JobFit 服务返回 HTTP ${status}，响应为空。`;
  if (Array.isArray(body.detail)) {
    return body.detail.map((item) => item.msg || JSON.stringify(item)).join("；");
  }
  const detail = body.detail || body.error || body.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return `JobFit 服务返回 HTTP ${status}。`;
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const reason = error && error.message ? error.message : String(error);
    throw new Error(`无法连接 JobFit 服务（${reason}）。请确认服务已启动且地址正确。`);
  }
  const body = await readResponse(response);
  if (!response.ok) {
    throw new Error(serviceError(body, response.status));
  }
  return body;
}

async function testHealth(message) {
  const started = Date.now();
  const body = await requestJson(endpoint(message.serverUrl, "/api/boss/health"), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  return {
    ok: true,
    message: "JobFit 服务连接正常。",
    latencyMs: Date.now() - started,
    service: body
  };
}

function isBossUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "www.zhipin.com";
  } catch (_) {
    return false;
  }
}

async function getActiveBossTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || typeof tab.id !== "number") {
    throw new Error("找不到当前活动标签页。");
  }
  if (!isBossUrl(tab.url || "")) {
    throw new Error("请先主动打开 https://www.zhipin.com 的职位搜索页或职位详情页。");
  }
  return tab;
}

async function collectPage(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["parser.js", "content.js"]
  });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.JobFitBossCollector?.collect()
  });
  return results && results[0] ? results[0].result : null;
}

async function collectJobs(message) {
  const tab = await getActiveBossTab();
  const collected = await collectPage(tab);
  if (!collected || !Array.isArray(collected.jobs)) {
    throw new Error("页面解析没有返回可识别的职位数据，请刷新页面后重试。");
  }
  if (!collected.ok || collected.jobs.length === 0) {
    return {
      ok: false,
      collected: 0,
      imported: null,
      error: collected.reason || "当前页面没有检测到可靠的可见职位。"
    };
  }

  const body = await requestJson(endpoint(message.serverUrl, "/api/boss/jobs/import"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ jobs: collected.jobs })
  });
  const imported = pickNumber(body, ["imported", "imported_count", "inserted", "created", "accepted"]);
  const updated = pickNumber(body, ["updated", "updated_count"]);
  const total = pickNumber(body, ["total", "processed"]);
  return {
    ok: true,
    collected: collected.jobs.length,
    imported,
    updated,
    total,
    service: body
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  let operation;
  if (message.type === "JOBFIT_TEST_HEALTH") {
    operation = testHealth(message);
  } else if (message.type === "JOBFIT_COLLECT_JOBS") {
    operation = collectJobs(message);
  } else {
    return false;
  }

  operation
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});
