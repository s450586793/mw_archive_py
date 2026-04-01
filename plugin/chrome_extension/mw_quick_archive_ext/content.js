(function () {
  "use strict";
  if (window.__MW_ARCHIVE_EXT_LOADED__) return;
  window.__MW_ARCHIVE_EXT_LOADED__ = true;

  const BTN_ID = "mw-archive-ext-btn";
  const NOTICE_ID = "mw-archive-ext-notice";
  const BADGE_ID_ACTION = "mw-archive-ext-status-badge-action";
  let inFlight = false;
  let badgeInFlight = false;
  let badgeLastHref = "";
  let badgeLastModelId = "";
  let badgeLastStatus = null;

  function isTargetPage() {
    return /^https:\/\/makerworld\.(com|com\.cn)\/zh\/models\/.+/i.test(location.href);
  }

  function toast(text) {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:70px",
      "z-index:2147483647",
      "background:rgba(0,0,0,.78)",
      "color:#fff",
      "padding:8px 12px",
      "border-radius:8px",
      "font-size:12px",
      "font-weight:600",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Microsoft YaHei,sans-serif"
    ].join(";");
    document.body.appendChild(el);
    setTimeout(() => {
      try { el.remove(); } catch (_) {}
    }, 2600);
  }

  function showNotice(title, text, tone) {
    const old = document.getElementById(NOTICE_ID);
    if (old) {
      try { old.remove(); } catch (_) {}
    }
    const overlay = document.createElement("div");
    overlay.id = NOTICE_ID;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "background:rgba(15,23,42,.38)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:20px"
    ].join(";");
    const colors = tone === "success"
      ? { bg: "#ecfeff", border: "#06b6d4", title: "#155e75", text: "#164e63" }
      : tone === "error"
        ? { bg: "#fff1f2", border: "#f43f5e", title: "#9f1239", text: "#881337" }
        : { bg: "#f0fdf4", border: "#22c55e", title: "#166534", text: "#14532d" };
    const panel = document.createElement("div");
    panel.style.cssText = [
      "width:min(92vw,420px)",
      `background:${colors.bg}`,
      `border:3px solid ${colors.border}`,
      "border-radius:18px",
      "box-shadow:0 24px 60px rgba(15,23,42,.28)",
      "padding:22px 24px",
      "text-align:center",
      'font-family:system-ui,-apple-system,Segoe UI,Roboto,Microsoft YaHei,sans-serif'
    ].join(";");
    panel.innerHTML = `
      <div style="font-size:24px;font-weight:800;color:${colors.title};margin-bottom:10px;">${title}</div>
      <div style="font-size:15px;line-height:1.7;color:${colors.text};white-space:pre-wrap;">${text}</div>
    `;
    overlay.appendChild(panel);
    overlay.addEventListener("click", () => {
      try { overlay.remove(); } catch (_) {}
    });
    document.body.appendChild(overlay);
    setTimeout(() => {
      if (tone === "loading") {
        try { overlay.remove(); } catch (_) {}
      }
    }, 1600);
  }

  async function sendMessage(payload) {
    return chrome.runtime.sendMessage(payload);
  }

  function extractModelIdFromUrl() {
    const path = String(location.pathname || "");
    const m = path.match(/\/models\/(\d+)/i);
    return m ? String(m[1] || "").trim() : "";
  }

  function clearArchiveStatusBadge() {
    const el = document.getElementById(BADGE_ID_ACTION);
    if (el) {
      try { el.remove(); } catch (_) {}
    }
  }

  async function isArchiveBadgeEnabled() {
    try {
      const res = await sendMessage({ action: "getArchiveBadgeEnabled" });
      if (!res || !res.ok) return true;
      return res.enabled !== false;
    } catch (_) {
      return true;
    }
  }

  function formatArchiveDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return raw.slice(0, 10);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function buildArchiveBadge(statusData) {
    const exists = !!(statusData && statusData.exists);
    const archivedAt = exists ? formatArchiveDate(statusData.archived_at) : "";
    const text = exists ? `已归档 · ${archivedAt}` : "未归档";
    const bg = exists ? "#00b800" : "#f5f5f5";
    const color = exists ? "#ffffff" : "#5f6368";
    const border = exists ? "#00b800" : "#bdbdbd";

    const badge = document.createElement("button");
    badge.id = BADGE_ID_ACTION;
    badge.type = "button";
    badge.disabled = true;
    badge.textContent = text;
    badge.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "white-space:nowrap",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Microsoft YaHei,sans-serif",
      "font-size:14px",
      "font-weight:700",
      "line-height:18px",
      `color:${color}`,
      `background:${bg}`,
      `border:1px solid ${border}`,
      "border-radius:8px",
      "padding:2px 8px",
      "margin-left:8px",
      "cursor:default",
      "opacity:1"
    ].join(";");
    return badge;
  }

  function injectArchiveBadge(statusData) {
    clearArchiveStatusBadge();
    const actionWrap = document.querySelector("div.mw-css-wn1ugj");
    if (!actionWrap) return 0;
    const badge = buildArchiveBadge(statusData);
    const followBtn = actionWrap.querySelector("button[designid], button.unfollow, button.follow");
    if (followBtn && followBtn.parentElement) {
      followBtn.insertAdjacentElement("afterend", badge);
      return 1;
    }
    actionWrap.appendChild(badge);
    return 1;
  }

  function scheduleBadgeRender(statusData) {
    let attempt = 0;
    const maxAttempts = 20;
    const tick = async () => {
      if (!isTargetPage()) {
        clearArchiveStatusBadge();
        return;
      }
      if (!(await isArchiveBadgeEnabled())) {
        clearArchiveStatusBadge();
        return;
      }
      const mounted = injectArchiveBadge(statusData);
      attempt += 1;
      if (mounted < 1 && attempt < maxAttempts) {
        setTimeout(tick, 500);
      }
    };
    tick();
  }

  async function fetchArchiveStatus(modelId) {
    const res = await sendMessage({ action: "getApiBase" });
    if (!res || !res.ok || !res.apiBase) throw new Error("未配置后端地址");
    const apiBase = String(res.apiBase || "").replace(/\/+$/, "");
    const resp = await fetch(`${apiBase}/api/archive/status/${encodeURIComponent(modelId)}`, {
      method: "GET",
      cache: "no-store"
    });
    const text = await resp.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return data;
  }

  async function refreshArchiveBadge(force = false) {
    if (!isTargetPage()) {
      clearArchiveStatusBadge();
      return;
    }
    if (!(await isArchiveBadgeEnabled())) {
      clearArchiveStatusBadge();
      return;
    }
    const modelId = extractModelIdFromUrl();
    if (!modelId) {
      clearArchiveStatusBadge();
      return;
    }
    if (!force && badgeInFlight) return;
    if (!force && modelId === badgeLastModelId && badgeLastStatus) {
      scheduleBadgeRender(badgeLastStatus);
      return;
    }
    badgeInFlight = true;
    try {
      const data = await fetchArchiveStatus(modelId);
      badgeLastModelId = modelId;
      badgeLastStatus = {
        exists: !!(data && data.exists),
        archived_at: data && data.archived_at ? String(data.archived_at) : ""
      };
      scheduleBadgeRender(badgeLastStatus);
    } catch (_) {
      badgeLastModelId = modelId;
      badgeLastStatus = { exists: false, archived_at: "" };
      scheduleBadgeRender(badgeLastStatus);
    } finally {
      badgeInFlight = false;
    }
  }

  async function onArchiveClick() {
    if (inFlight) {
      toast("归档进行中，请稍后");
      return;
    }
    inFlight = true;
    try {
      showNotice("开始归档", "当前模型已提交归档，请等待完成提示。", "loading");
      const res = await sendMessage({
        action: "archiveModel",
        url: location.href.split("#")[0]
      });
      if (res && res.ok) {
        const message = res.message || "归档成功";
        toast(message);
        showNotice("归档完成", message, "success");
      } else {
        const message = (res && res.message) || "归档失败";
        toast(message);
        showNotice("归档失败", message, "error");
      }
    } catch (err) {
      const message = `归档失败: ${err && err.message ? err.message : err}`;
      toast(message);
      showNotice("归档失败", message, "error");
    } finally {
      inFlight = false;
    }
  }

  function injectButton() {
    if (!isTargetPage()) return;
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.innerHTML = '<span style="font-size:14px;line-height:1;display:inline-block;">📦</span><span>归档模型</span>';
    btn.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:2147483646",
      "padding:10px 18px",
      "border:none",
      "border-radius:999px",
      "background:#00b800",
      "color:#fff",
      "font-size:13px",
      "font-weight:700",
      "line-height:1",
      "display:inline-flex",
      "align-items:center",
      "gap:8px",
      "white-space:nowrap",
      "font-family:system-ui,-apple-system,Segoe UI,Roboto,Microsoft YaHei,sans-serif",
      "cursor:pointer",
      "box-shadow:0 6px 16px rgba(0,0,0,.25)"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "#00a800"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#00b800"; });
    btn.addEventListener("click", onArchiveClick);
    document.body.appendChild(btn);
  }

  function installArchiveBadgeWatcher() {
    badgeLastHref = location.href;
    refreshArchiveBadge(true);
    setInterval(() => {
      if (!isTargetPage()) {
        clearArchiveStatusBadge();
        return;
      }
      if (location.href !== badgeLastHref) {
        badgeLastHref = location.href;
        badgeLastModelId = "";
        badgeLastStatus = null;
        refreshArchiveBadge(true);
        return;
      }
      refreshArchiveBadge(false);
    }, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      injectButton();
      installArchiveBadgeWatcher();
    });
  } else {
    injectButton();
    installArchiveBadgeWatcher();
  }
})();
