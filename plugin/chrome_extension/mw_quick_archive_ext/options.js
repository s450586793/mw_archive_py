function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function normalizeApiBase(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

async function init() {
  const [apiRes, cookieRes, tokenRes] = await Promise.all([
    send({ action: "getApiBase" }),
    send({ action: "getManualCookie" }),
    send({ action: "getApiToken" })
  ]);
  if (apiRes && apiRes.ok) document.getElementById("apiBase").value = apiRes.apiBase || "";
  if (tokenRes && tokenRes.ok) document.getElementById("apiToken").value = tokenRes.apiToken || "";
  if (cookieRes && cookieRes.ok) document.getElementById("manualCookie").value = cookieRes.cookie || "";
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const apiBase = normalizeApiBase(document.getElementById("apiBase").value);
  const apiToken = document.getElementById("apiToken").value.trim();
  const [baseRes, tokenRes] = await Promise.all([
    send({ action: "setApiBase", apiBase }),
    send({ action: "setApiToken", apiToken })
  ]);
  if (baseRes && baseRes.ok && tokenRes && tokenRes.ok) {
    setStatus(`已保存: ${baseRes.apiBase}`);
    document.getElementById("apiBase").value = baseRes.apiBase || "";
    document.getElementById("apiToken").value = tokenRes.apiToken || "";
  } else {
    setStatus((baseRes && baseRes.message) || (tokenRes && tokenRes.message) || "保存失败");
  }
});

document.getElementById("syncCookieBtn").addEventListener("click", async () => {
  setStatus("正在同步 Cookie...");
  const res = await send({ action: "syncCookie" });
  if (res && res.ok) {
    setStatus(`${res.message} (项数: ${res.count})`);
  } else {
    setStatus((res && res.message) || "同步失败");
  }
});

document.getElementById("saveManualCookieBtn").addEventListener("click", async () => {
  const cookie = document.getElementById("manualCookie").value.trim();
  if (!cookie) {
    setStatus("手动 Cookie 不能为空");
    return;
  }
  setStatus("正在保存并同步手动 Cookie...");
  const res = await send({ action: "setManualCookie", cookie });
  if (res && res.ok) {
    const cf = res.hasCfClearance ? "含 cf_clearance" : "未含 cf_clearance";
    setStatus(`${res.message} (项数: ${res.count}, ${cf})`);
  } else {
    setStatus((res && res.message) || "手动 Cookie 同步失败");
  }
});

init().catch((e) => setStatus(`初始化失败: ${e && e.message ? e.message : e}`));
