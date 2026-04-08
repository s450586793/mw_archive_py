function setStatus(text) {
  const el = document.getElementById("status");
  el.textContent = text;
}

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function normalizeApiBase(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  return tab && tab.url ? tab.url : "";
}

function isModelUrl(url) {
  return /^https:\/\/makerworld\.com\.cn\/zh\/models\/.+/i.test(url || "");
}

function getOriginFromApiBase(apiBase) {
  try {
    const u = new URL(apiBase);
    return `${u.protocol}//${u.host}`;
  } catch (_) {
    return "";
  }
}

function setOpenLocalEnabled(url) {
  const btn = document.getElementById("openLocalBtn");
  if (!btn) return;
  btn.disabled = !url;
  btn.dataset.url = url || "";
}

async function init() {
  const res = await send({ action: "getApiBase" });
  if (res && res.ok) {
    document.getElementById("apiBase").value = res.apiBase || "";
  }
  setOpenLocalEnabled("");
  setStatus("准备就绪");
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const apiBase = normalizeApiBase(document.getElementById("apiBase").value);
  const res = await send({ action: "setApiBase", apiBase });
  if (res && res.ok) {
    setStatus(`已保存: ${res.apiBase}`);
    document.getElementById("apiBase").value = res.apiBase || "";
  } else {
    setStatus((res && res.message) || "保存失败");
  }
});

document.getElementById("testConnBtn").addEventListener("click", async () => {
  let apiBase = normalizeApiBase(document.getElementById("apiBase").value);
  if (!apiBase) {
    const apiBaseRes = await send({ action: "getApiBase" });
    apiBase = apiBaseRes && apiBaseRes.ok ? normalizeApiBase(apiBaseRes.apiBase || "") : "";
  }
  if (!apiBase) {
    setStatus("请先配置后端 API 地址");
    return;
  }
  setStatus(`测试连接中: ${apiBase}`);
  try {
    const tokenRes = await send({ action: "getApiToken" });
    const headers = {};
    if (tokenRes && tokenRes.ok && tokenRes.apiToken) {
      headers.Authorization = `Bearer ${tokenRes.apiToken}`;
    }
    const resp = await fetch(`${apiBase}/api/config`, { method: "GET", cache: "no-store", headers });
    if (!resp.ok) {
      setStatus(`连接失败: HTTP ${resp.status}`);
      return;
    }
    setStatus(`连接成功: ${apiBase}`);
  } catch (e) {
    setStatus(`连接失败: ${e && e.message ? e.message : e}`);
  }
});

document.getElementById("syncCookieBtn").addEventListener("click", async () => {
  setStatus("正在同步 Cookie...");
  const res = await send({ action: "syncCookie" });
  if (res && res.ok) {
    const cf = res.hasCfClearance ? "含 cf_clearance" : "未含 cf_clearance";
    setStatus(`${res.message} (项数: ${res.count}, 来源: ${res.source}, ${cf})`);
  } else {
    setStatus((res && res.message) || "同步失败");
  }
});

document.getElementById("openHomeBtn").addEventListener("click", async () => {
  const inputVal = normalizeApiBase(document.getElementById("apiBase").value);
  let apiBase = inputVal;
  if (!apiBase) {
    const apiBaseRes = await send({ action: "getApiBase" });
    apiBase = apiBaseRes && apiBaseRes.ok ? normalizeApiBase(apiBaseRes.apiBase || "") : "";
  }
  if (!apiBase) {
    setStatus("请先配置后端 API 地址");
    return;
  }
  await chrome.tabs.create({ url: apiBase });
});

document.getElementById("openLocalBtn").addEventListener("click", async () => {
  const url = document.getElementById("openLocalBtn").dataset.url || "";
  if (!url) {
    setStatus("暂无可打开的本地模型地址");
    return;
  }
  await chrome.tabs.create({ url });
});

document.getElementById("archiveBtn").addEventListener("click", async () => {
  const url = await getActiveTabUrl();
  if (!isModelUrl(url)) {
    setStatus("当前标签不是 MakerWorld 模型页");
    return;
  }
  setStatus("正在归档...");
  const res = await send({ action: "archiveModel", url });
  if (res && res.ok) {
    const base = res.data && res.data.base_name ? `\n${res.data.base_name}` : "";
    const apiBaseRes = await send({ action: "getApiBase" });
    const apiBase = apiBaseRes && apiBaseRes.ok ? apiBaseRes.apiBase : "";
    const origin = getOriginFromApiBase(apiBase);
    const baseName = res.data && res.data.base_name ? res.data.base_name : "";
    const localUrl = origin && baseName ? `${origin}/v2/files/${encodeURIComponent(baseName)}` : "";
    setOpenLocalEnabled(localUrl);
    setStatus(`${res.message}${base}${localUrl ? `\n本地: ${localUrl}` : ""}`);
  } else {
    setStatus((res && res.message) || "归档失败");
  }
});

init().catch((e) => setStatus(`初始化失败: ${e && e.message ? e.message : e}`));
