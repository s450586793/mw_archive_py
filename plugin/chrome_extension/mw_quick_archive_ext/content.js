(function () {
  "use strict";
  if (window.__MW_ARCHIVE_EXT_LOADED__) return;
  window.__MW_ARCHIVE_EXT_LOADED__ = true;

  const BTN_ID = "mw-archive-ext-btn";
  let inFlight = false;

  function isTargetPage() {
    return /^https:\/\/makerworld\.com\.cn\/zh\/models\/.+/i.test(location.href);
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

  async function sendMessage(payload) {
    return chrome.runtime.sendMessage(payload);
  }

  async function onArchiveClick() {
    if (inFlight) {
      toast("归档进行中，请稍后");
      return;
    }
    inFlight = true;
    try {
      const res = await sendMessage({
        action: "archiveModel",
        url: location.href.split("#")[0]
      });
      if (res && res.ok) {
        toast(res.message || "归档成功");
      } else {
        toast((res && res.message) || "归档失败");
      }
    } catch (err) {
      toast(`归档失败: ${err && err.message ? err.message : err}`);
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }
})();
