const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const DEFAULT_ARCHIVE_BADGE_ENABLED = true;
let archiveInFlight = false;

function normalizeApiBase(raw) {
  const v = String(raw || "").trim();
  if (!v) return DEFAULT_API_BASE;
  return v.replace(/\/+$/, "");
}

async function getApiBase() {
  const data = await chrome.storage.local.get(["apiBase"]);
  return normalizeApiBase(data.apiBase);
}

async function setApiBase(apiBase) {
  const normalized = normalizeApiBase(apiBase);
  await chrome.storage.local.set({ apiBase: normalized });
  return normalized;
}

async function getArchiveBadgeEnabled() {
  const data = await chrome.storage.local.get(["archiveBadgeEnabled"]);
  if (typeof data.archiveBadgeEnabled === "boolean") return data.archiveBadgeEnabled;
  return DEFAULT_ARCHIVE_BADGE_ENABLED;
}

async function setArchiveBadgeEnabled(enabled) {
  const value = !!enabled;
  await chrome.storage.local.set({ archiveBadgeEnabled: value });
  return value;
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {
    data = { raw: text };
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function archiveModel(modelUrl) {
  if (archiveInFlight) {
    return { ok: false, message: "归档请求进行中，请稍后" };
  }
  archiveInFlight = true;
  try {
    const apiBase = await getApiBase();
    const url = String(modelUrl || "").split("#")[0];
    const data = await postJson(`${apiBase}/api/archive`, { url });
    const msg = data.message || (data.action === "updated" ? "模型已更新成功" : "模型归档成功");
    return { ok: true, message: msg, data };
  } finally {
    archiveInFlight = false;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  const apiBase = await getApiBase();
  const badgeEnabled = await getArchiveBadgeEnabled();
  await setApiBase(apiBase);
  await setArchiveBadgeEnabled(badgeEnabled);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    const action = msg && msg.action;
    if (action === "getApiBase") {
      sendResponse({ ok: true, apiBase: await getApiBase() });
      return;
    }
    if (action === "setApiBase") {
      const apiBase = await setApiBase(msg.apiBase);
      sendResponse({ ok: true, apiBase });
      return;
    }
    if (action === "getArchiveBadgeEnabled") {
      sendResponse({ ok: true, enabled: await getArchiveBadgeEnabled() });
      return;
    }
    if (action === "setArchiveBadgeEnabled") {
      const enabled = await setArchiveBadgeEnabled(msg.enabled);
      sendResponse({ ok: true, enabled });
      return;
    }
    if (action === "archiveModel") {
      sendResponse(await archiveModel(msg.url));
      return;
    }
    sendResponse({ ok: false, message: "未知操作" });
  })().catch((err) => {
    sendResponse({ ok: false, message: err && err.message ? err.message : String(err) });
  });
  return true;
});
