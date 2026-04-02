import json
from typing import Callable, Dict, Optional

import requests

from notification_templates import build_alert_notification, build_success_notification


class FeishuPushService:
    """
    飞书推送服务：
    - 文本推送：仅需 webhook_url
    - 图文推送：需 webhook_url + app_id + app_secret（用于上传封面图拿 image_key）
    """

    TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    IMAGE_UPLOAD_URL = "https://open.feishu.cn/open-apis/im/v1/images"

    def __init__(self, cfg_getter: Callable[[], Dict], logger):
        self._cfg_getter = cfg_getter
        self._logger = logger

    def should_run(self) -> bool:
        cfg = self._cfg_getter() or {}
        if not cfg.get("enable_push"):
            return False
        webhook = str(cfg.get("webhook_url") or "").strip()
        return bool(webhook)

    def start(self):
        # 飞书 webhook 无需常驻线程
        return self.should_run()

    def stop(self):
        return True

    def notify_success(self, payload: Dict):
        cfg = self._cfg_getter() or {}
        if not cfg.get("enable_push"):
            return
        webhook = str(cfg.get("webhook_url") or "").strip()
        if not webhook:
            return

        rendered = build_success_notification(payload or {})
        text = rendered.get("text") or ""
        title = rendered.get("title") or "模型归档通知"
        image_key = self._resolve_image_key(payload or {}, cfg)
        if image_key:
            ok = self._send_post_with_image(webhook, title=title, text=text, image_key=image_key)
            if ok:
                return
        self._send_text(webhook, text)

    def notify_alert(self, alert, detail: Optional[str] = None):
        cfg = self._cfg_getter() or {}
        if not cfg.get("enable_push"):
            return
        webhook = str(cfg.get("webhook_url") or "").strip()
        if not webhook:
            return
        self._send_text(webhook, self._format_alert_text(alert, detail))

    def send_test_connection(self) -> Dict:
        cfg = self._cfg_getter() or {}
        webhook = str(cfg.get("webhook_url") or "").strip()
        if not webhook:
            return {"status": "error", "message": "飞书 Webhook 未配置"}
        ok = self._send_text(webhook, "✅ 飞书连接测试成功\n已收到来自本地模型库控制台的测试消息。")
        return {
            "status": "ok" if ok else "error",
            "message": "飞书测试消息发送成功" if ok else "飞书测试消息发送失败",
        }

    def _format_success_text(self, payload: Dict) -> str:
        return build_success_notification(payload).get("text") or ""

    def _format_alert_text(self, alert, detail: Optional[str] = None) -> str:
        return build_alert_notification(alert, detail).get("text") or ""

    def _resolve_image_key(self, payload: Dict, cfg: Dict) -> str:
        app_id = str(cfg.get("app_id") or "").strip()
        app_secret = str(cfg.get("app_secret") or "").strip()
        cover_url = str(payload.get("cover_url") or "").strip()
        if not app_id or not app_secret or not cover_url:
            return ""
        if not cover_url.lower().startswith(("http://", "https://")):
            return ""
        try:
            token = self._get_tenant_access_token(app_id, app_secret)
            if not token:
                return ""
            return self._upload_image_by_url(token, cover_url)
        except Exception as e:
            self._logger.warning("飞书上传封面图失败，降级为文本推送: %s", e)
            return ""

    def _get_tenant_access_token(self, app_id: str, app_secret: str) -> str:
        payload = {"app_id": app_id, "app_secret": app_secret}
        resp = requests.post(self.TOKEN_URL, json=payload, timeout=15)
        if not resp.ok:
            raise RuntimeError(f"飞书鉴权失败 HTTP {resp.status_code}")
        data = resp.json() if resp.content else {}
        if int(data.get("code") or 0) != 0:
            raise RuntimeError(f"飞书鉴权失败: {data.get('msg') or 'unknown'}")
        return str(data.get("tenant_access_token") or "").strip()

    def _upload_image_by_url(self, tenant_token: str, cover_url: str) -> str:
        img = requests.get(cover_url, timeout=20)
        if not img.ok:
            raise RuntimeError(f"下载封面图失败 HTTP {img.status_code}")
        headers = {"Authorization": f"Bearer {tenant_token}"}
        files = {
            "image_type": (None, "message"),
            "image": ("cover.jpg", img.content, "image/jpeg"),
        }
        resp = requests.post(self.IMAGE_UPLOAD_URL, headers=headers, files=files, timeout=20)
        if not resp.ok:
            raise RuntimeError(f"上传封面图失败 HTTP {resp.status_code}")
        data = resp.json() if resp.content else {}
        if int(data.get("code") or 0) != 0:
            raise RuntimeError(f"上传封面图失败: {data.get('msg') or 'unknown'}")
        image_key = ""
        if isinstance(data.get("data"), dict):
            image_key = str(data["data"].get("image_key") or "").strip()
        if not image_key:
            raise RuntimeError("上传封面图失败: image_key 为空")
        return image_key

    def _send_text(self, webhook: str, text: str) -> bool:
        payload = {
            "msg_type": "text",
            "content": {
                "text": str(text or "").strip(),
            },
        }
        return self._post_webhook(webhook, payload)

    def _send_post_with_image(self, webhook: str, title: str, text: str, image_key: str) -> bool:
        text_rows = []
        for row in str(text or "").splitlines():
            value = row.strip()
            if value:
                text_rows.append([{"tag": "text", "text": value}])
        content_rows = []
        if image_key:
            content_rows.append([{"tag": "img", "image_key": image_key}])
        content_rows.extend(text_rows)
        payload = {
            "msg_type": "post",
            "content": {
                "post": {
                    "zh_cn": {
                        "title": str(title or "通知").strip(),
                        "content": content_rows or [[{"tag": "text", "text": "通知"}]],
                    }
                }
            },
        }
        return self._post_webhook(webhook, payload)

    def _post_webhook(self, webhook: str, payload: Dict) -> bool:
        try:
            resp = requests.post(webhook, json=payload, timeout=15)
        except Exception as e:
            self._logger.warning("飞书 webhook 请求失败: %s", e)
            return False
        if not resp.ok:
            self._logger.warning("飞书 webhook HTTP %s: %s", resp.status_code, (resp.text or "")[:200])
            return False
        try:
            data = resp.json() if resp.content else {}
        except Exception:
            data = {}
        status_code = int(data.get("StatusCode") or 0)
        code = int(data.get("code") or 0)
        if status_code not in {0} and code not in {0}:
            self._logger.warning("飞书 webhook 返回异常: %s", json.dumps(data, ensure_ascii=False)[:300])
            return False
        return True
