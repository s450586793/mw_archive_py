const DEFAULT_API_BASE = "http://127.0.0.1:8000";
let syncInFlight = false;
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

async function getManualCookie() {
  const data = await chrome.storage.local.get(["manualCookie"]);
  return String(data.manualCookie || "").trim();
}

function dedupeCookies(cookies) {
  const map = new Map();
  for (const c of cookies || []) {
    if (!c || !c.name) continue;
    // 同名 cookie 取路径更长、过期更晚的条目
    const prev = map.get(c.name);
    if (!prev) {
      map.set(c.name, c);
      continue;
    }
    const prevPathLen = (prev.path || "").length;
    const curPathLen = (c.path || "").length;
    const prevExp = prev.expirationDate || 0;
    const curExp = c.expirationDate || 0;
    if (curPathLen > prevPathLen || curExp > prevExp) {
      map.set(c.name, c);
    }
  }
  return Array.from(map.values());
}

function parseCookieNames(cookieStr) {
  return String(cookieStr || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf("=");
      return idx > 0 ? p.slice(0, idx).trim() : "";
    })
    .filter(Boolean);
}

function hasCfClearance(cookieStr) {
  const names = parseCookieNames(cookieStr).map((n) => n.toLowerCase());
  return names.includes("cf_clearance");
}

async function probeCookieHeaderViaRequest() {
  const token = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const probeUrl = `https://makerworld.com.cn/favicon_new.png?mw_cookie_probe=${token}`;
  return new Promise((resolve) => {
    let done = false;
    const finish = (cookieStr) => {
      if (done) return;
      done = true;
      try {
        chrome.webRequest.onBeforeSendHeaders.removeListener(listener);
      } catch (_) {}
      resolve(cookieStr || "");
    };

    const listener = (details) => {
      if (!details || !details.url || !details.url.includes(`mw_cookie_probe=${token}`)) return;
      const headers = details.requestHeaders || [];
      const h = headers.find((x) => x && x.name && x.name.toLowerCase() === "cookie");
      finish((h && h.value) || "");
    };

    try {
      chrome.webRequest.onBeforeSendHeaders.addListener(
        listener,
        { urls: ["https://makerworld.com.cn/*"] },
        ["requestHeaders", "extraHeaders"]
      );
    } catch (_) {
      resolve("");
      return;
    }

    fetch(probeUrl, { method: "GET", credentials: "include", cache: "no-store" })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => finish(""), 700);
      });
  });
}

async function buildMakerworldCookieHeader() {
  const [cnA, cnB, comA, comB] = await Promise.all([
    chrome.cookies.getAll({ domain: "makerworld.com.cn" }),
    chrome.cookies.getAll({ domain: ".makerworld.com.cn" }),
    chrome.cookies.getAll({ domain: "makerworld.com" }),
    chrome.cookies.getAll({ domain: ".makerworld.com" })
  ]);
  const merged = dedupeCookies([...(cnA || []), ...(cnB || []), ...(comA || []), ...(comB || [])]);
  let cookie = merged.map((c) => `${c.name}=${c.value}`).join("; ");
  let source = "cookies_api";

  if (!hasCfClearance(cookie)) {
    const probed = await probeCookieHeaderViaRequest();
    if (probed && probed.length > cookie.length) {
      cookie = probed;
      source = "request_header_probe";
    }
  }
  return { cookie, count: parseCookieNames(cookie).length, source, hasCfClearance: hasCfClearance(cookie) };
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

async function syncCookieToBackend() {
  if (syncInFlight) {
    return { ok: false, message: "Cookie 同步进行中，请稍后" };
  }
  syncInFlight = true;
  try {
    const apiBase = await getApiBase();
    const { cookie, count, source, hasCfClearance } = await buildMakerworldCookieHeader();
    if (!cookie) {
      return { ok: false, message: "未读取到可用 Cookie（请先登录 MakerWorld）" };
    }
    await postJson(`${apiBase}/api/cookie`, { cookie });
    return {
      ok: true,
      message: hasCfClearance ? "Cookie 同步成功" : "Cookie 已同步（未检测到 cf_clearance）",
      count,
      source,
      hasCfClearance
    };
  } finally {
    syncInFlight = false;
  }
}

async function setManualCookieToBackend(cookieRaw) {
  const cookie = String(cookieRaw || "").trim();
  if (!cookie) {
    return { ok: false, message: "手动 Cookie 不能为空" };
  }
  const apiBase = await getApiBase();
  await postJson(`${apiBase}/api/cookie`, { cookie });
  await chrome.storage.local.set({ manualCookie: cookie });
  return {
    ok: true,
    message: hasCfClearance(cookie) ? "手动 Cookie 已保存并同步" : "手动 Cookie 已保存并同步（未检测到 cf_clearance）",
    count: parseCookieNames(cookie).length,
    source: "manual_input",
    hasCfClearance: hasCfClearance(cookie)
  };
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
  await setApiBase(apiBase);
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
    if (action === "getManualCookie") {
      sendResponse({ ok: true, cookie: await getManualCookie() });
      return;
    }
    if (action === "setManualCookie") {
      sendResponse(await setManualCookieToBackend(msg.cookie));
      return;
    }
    if (action === "syncCookie") {
      sendResponse(await syncCookieToBackend());
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
