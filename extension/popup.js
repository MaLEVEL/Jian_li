"use strict";

const DEFAULT_SERVER_URL = "http://127.0.0.1:18001";
const STORAGE_KEY = "jobfitServerUrl";

const serverInput = document.getElementById("server-url");
const healthBadge = document.getElementById("health-badge");
const testButton = document.getElementById("test-health");
const collectButton = document.getElementById("collect-jobs");
const totalCount = document.getElementById("total-count");
const importedCount = document.getElementById("imported-count");
const updatedCount = document.getElementById("updated-count");
const statusNode = document.getElementById("status");

function setStatus(message, kind = "") {
  statusNode.textContent = message || "";
  statusNode.className = "status";
  if (kind) statusNode.classList.add(kind);
}

function setHealth(label, kind) {
  healthBadge.textContent = label;
  healthBadge.className = `badge badge-${kind}`;
}

function setBusy(button, busy, busyLabel, idleLabel) {
  button.disabled = busy;
  button.textContent = busy ? busyLabel : idleLabel;
}

function setResultCounts(result) {
  const fallback = result.ok ? "未知" : "—";
  totalCount.textContent = Number.isFinite(result.total) ? String(result.total) : fallback;
  importedCount.textContent = Number.isFinite(result.imported) ? String(result.imported) : fallback;
  updatedCount.textContent = Number.isFinite(result.updated) ? String(result.updated) : fallback;
}

async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response) throw new Error("扩展后台没有返回结果，请重新加载扩展。");
  return response;
}

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

function normalizeInput() {
  const value = serverInput.value.trim() || DEFAULT_SERVER_URL;
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || !isTrustedHostname(parsed.hostname)) {
    throw new Error("服务地址必须是本机、可信局域网或 Tailscale 私有地址。");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("服务地址不能包含账号、查询参数或锚点。");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function saveServerUrl() {
  const serverUrl = normalizeInput();
  serverInput.value = serverUrl;
  await chrome.storage.local.set({ [STORAGE_KEY]: serverUrl });
  return serverUrl;
}

async function ensureServerPermission(serverUrl) {
  const parsed = new URL(serverUrl);
  const host = parsed.hostname.startsWith("[") ? parsed.hostname : `[${parsed.hostname}]`;
  const pattern = `${parsed.protocol}//${parsed.hostname.includes(":") ? host : parsed.hostname}/*`;
  // Call request directly from the click task. An async contains() check before
  // request() can consume the user gesture on stricter Chromium versions.
  const granted = await chrome.permissions.request({ origins: [pattern] });
  if (!granted) throw new Error("需要允许扩展访问这个职启云帆服务地址。");
}

async function onTestHealth() {
  setBusy(testButton, true, "连接中…", "测试连接");
  setHealth("检测中", "idle");
  setStatus("正在连接本机职启云帆服务…");
  try {
    const serverUrl = normalizeInput();
    serverInput.value = serverUrl;
    await ensureServerPermission(serverUrl);
    await chrome.storage.local.set({ [STORAGE_KEY]: serverUrl });
    const result = await sendMessage({ type: "YUNFAN_TEST_HEALTH", serverUrl });
    if (!result.ok) throw new Error(result.error || "健康检查失败。");
    setHealth("已连接", "ok");
    const latency = Number.isFinite(result.latencyMs) ? `（${result.latencyMs} ms）` : "";
    setStatus(`职启云帆服务连接正常${latency}`, "success");
  } catch (error) {
    setHealth("连接失败", "error");
    setStatus(error.message || "健康检查失败。", "error");
  } finally {
    setBusy(testButton, false, "连接中…", "测试连接");
  }
}

async function onCollectJobs() {
  setBusy(collectButton, true, "采集中…", "采集当前页");
  totalCount.textContent = "—";
  importedCount.textContent = "—";
  updatedCount.textContent = "—";
  setStatus("正在读取当前页面已显示的职位…");
  try {
    const serverUrl = normalizeInput();
    serverInput.value = serverUrl;
    await ensureServerPermission(serverUrl);
    await chrome.storage.local.set({ [STORAGE_KEY]: serverUrl });
    const result = await sendMessage({ type: "YUNFAN_COLLECT_JOBS", serverUrl });
    setResultCounts(result);
    if (!result.ok) {
      setStatus(result.error || "没有采集到可导入的职位。", "warning");
      return;
    }
    const totalText = Number.isFinite(result.total) ? String(result.total) : "未知";
    const importedText = Number.isFinite(result.imported) ? String(result.imported) : "未知";
    const updatedText = Number.isFinite(result.updated) ? String(result.updated) : "未知";
    setStatus(`采集完成：处理总数 ${totalText} 条，新增 ${importedText}，更新 ${updatedText}。`, "success");
    setHealth("已连接", "ok");
  } catch (error) {
    totalCount.textContent = "—";
    importedCount.textContent = "—";
    updatedCount.textContent = "—";
    setStatus(error.message || "采集失败。", "error");
    setHealth("连接失败", "error");
  } finally {
    setBusy(collectButton, false, "采集中…", "采集当前页");
  }
}

testButton.addEventListener("click", onTestHealth);
collectButton.addEventListener("click", onCollectJobs);
serverInput.addEventListener("change", () => {
  saveServerUrl()
    .then(() => {
      setHealth("未检测", "idle");
      setStatus("服务地址已保存。");
    })
    .catch((error) => setStatus(error.message, "error"));
});

chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_SERVER_URL }).then((stored) => {
  serverInput.value = stored[STORAGE_KEY] || DEFAULT_SERVER_URL;
});
