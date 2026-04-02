from typing import Dict, Optional


class _SafeDict(dict):
    def __missing__(self, key):
        return ""


DEFAULT_NOTIFICATION_TEMPLATES = {
    "success": {
        "title": "✅ {action_text}",
        "lines": [
            {"field": "title", "template": "📌标题：{title}"},
            {"field": "base_name", "template": "📁目录：{base_name}"},
            {"field": "online_url", "template": "🌐在线地址：{online_url}"},
            {"field": "duration_text", "template": "⏱️耗时：{duration_text}"},
            {
                "field": "missing_count",
                "template": "🚨缺失 3MF：{missing_count}",
                "predicate": "positive_int",
            },
        ],
    },
    "alert": {
        "title": "{icon} {title}",
    },
}


def render_template(template: str, context: Dict) -> str:
    return str(template or "").format_map(_SafeDict(context or {})).strip()


def _is_truthy_value(value) -> bool:
    return bool(str(value or "").strip())


def _should_include_line(rule: Dict, context: Dict) -> bool:
    field = str(rule.get("field") or "").strip()
    if not field:
        return True
    value = context.get(field)
    predicate = str(rule.get("predicate") or "").strip()
    if predicate == "positive_int":
        try:
            return int(value or 0) > 0
        except Exception:
            return False
    return _is_truthy_value(value)


def build_success_notification(payload: Dict) -> Dict[str, str]:
    data = payload or {}
    action = str(data.get("action") or "created").strip()
    action_text = "模型已更新" if action == "updated" else "模型归档成功"
    context = {
        "action": action,
        "action_text": action_text,
        "title": str(data.get("title") or "").strip(),
        "base_name": str(data.get("base_name") or "").strip(),
        "online_url": str(data.get("online_url") or "").strip(),
        "duration_text": str(data.get("duration_text") or "").strip(),
        "missing_count": int(data.get("missing_count") or 0),
    }
    tpl = DEFAULT_NOTIFICATION_TEMPLATES["success"]
    title = render_template(str(tpl.get("title") or ""), context)
    lines = []
    for rule in tpl.get("lines") or []:
        if not isinstance(rule, dict):
            continue
        if not _should_include_line(rule, context):
            continue
        line = render_template(str(rule.get("template") or ""), context)
        if line:
            lines.append(line)
    body = "\n".join(lines).strip()
    text = title if not body else f"{title}\n{body}"
    return {
        "title": title,
        "body": body,
        "text": text,
    }


def build_alert_notification(alert, detail: Optional[str] = None) -> Dict[str, str]:
    if isinstance(alert, dict):
        icon = str(alert.get("icon") or "⚠️").strip() or "⚠️"
        title_raw = str(alert.get("title") or "通知").strip() or "通知"
        summary = str(alert.get("summary") or "").strip()
        lines_raw = alert.get("lines") if isinstance(alert.get("lines"), list) else []
        body_lines = []
        if summary:
            body_lines.append(summary)
        for line in lines_raw:
            value = str(line or "").strip()
            if value:
                body_lines.append(value)
    else:
        icon = "⚠️"
        title_raw = str(alert or "通知").strip() or "通知"
        body_lines = []
        detail_value = str(detail or "").strip()
        if detail_value:
            body_lines.append(detail_value)
    title = render_template(
        DEFAULT_NOTIFICATION_TEMPLATES["alert"]["title"],
        {
            "icon": icon,
            "title": title_raw,
        },
    )
    body = "\n".join(body_lines).strip()
    text = title if not body else f"{title}\n{body}"
    return {
        "title": title,
        "body": body,
        "text": text,
    }
