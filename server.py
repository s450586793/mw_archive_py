import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import List

import requests
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from archiver import archive_model, download_file, fetch_instance_3mf, parse_cookies, sanitize_filename

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEFAULT_CONFIG = {
    "download_dir": "./data",
    "cookie_file": "./cookie.txt",
    "logs_dir": "./logs"
}

# 日志
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("app")
logger.setLevel(logging.INFO)
fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
# 文件
fh = logging.FileHandler(LOGS_DIR / "app.log", encoding="utf-8")
fh.setFormatter(fmt)
logger.addHandler(fh)
# 控制台
sh = logging.StreamHandler(sys.stdout)
sh.setFormatter(fmt)
logger.addHandler(sh)


# ---------- 配置与持久化 ----------
def load_config():
    if CONFIG_PATH.exists():
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    else:
        cfg = DEFAULT_CONFIG
        CONFIG_PATH.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    # 规范化为绝对路径
    cfg["download_dir"] = str((BASE_DIR / cfg.get("download_dir", "data")).resolve())
    cfg["cookie_file"] = str((BASE_DIR / cfg.get("cookie_file", "cookie.txt")).resolve())
    cfg["logs_dir"] = str((BASE_DIR / cfg.get("logs_dir", "logs")).resolve())
    Path(cfg["download_dir"]).mkdir(parents=True, exist_ok=True)
    Path(cfg["logs_dir"]).mkdir(parents=True, exist_ok=True)
    return cfg


def read_cookie(cfg) -> str:
    cookie_path = Path(cfg["cookie_file"])
    if cookie_path.exists():
        return cookie_path.read_text(encoding="utf-8").strip()
    return ""


def write_cookie(cfg, cookie: str):
    cookie_path = Path(cfg["cookie_file"])
    cookie_path.parent.mkdir(parents=True, exist_ok=True)
    cookie_path.write_text(cookie.strip(), encoding="utf-8")
    logger.info("Cookie 更新")
    # 额外记录更新时间
    with (Path(cfg["logs_dir"]) / "cookie.log").open("a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat()}\tupdate\n")


def parse_missing(cfg) -> List[dict]:
    missing_log = Path(cfg["logs_dir"]) / "missing_3mf.log"
    if not missing_log.exists():
        return []
    rows = []
    for line in missing_log.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) >= 5:
            ts, base_name, inst_id, title, status = parts[:5]
        elif len(parts) >= 4:
            ts, base_name, inst_id, title = parts[:4]
            status = ""
        else:
            continue
        rows.append({"time": ts, "base_name": base_name, "inst_id": inst_id, "title": title, "status": status})
    return rows


def pick_instance_filename(inst: dict, name_hint: str = "") -> str:
    base = sanitize_filename(inst.get("title") or inst.get("name") or str(inst.get("id") or "model"))
    if not base:
        base = str(inst.get("id") or "model")
    ext = Path(name_hint).suffix if name_hint else ""
    if not ext:
        ext = ".3mf"
    elif not ext.startswith("."):
        ext = "." + ext
    return f"{base}{ext}"


def retry_missing_downloads(cfg, cookie: str):
    missing_log = Path(cfg["logs_dir"]) / "missing_3mf.log"
    if not missing_log.exists():
        return {"processed": 0, "success": 0, "failed": 0, "details": []}

    lines = [line for line in missing_log.read_text(encoding="utf-8").splitlines() if line.strip()]

    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (MW-Redownload)"})
    session.cookies.update(parse_cookies(cookie))

    remaining_lines = []
    details = []
    success_cnt = 0

    for line in lines:
        parts = line.split("\t")
        if len(parts) < 4:
            remaining_lines.append(line)
            details.append({"status": "fail", "message": "行格式异常", "raw": line})
            continue
        _ts, base_name, inst_id, _title = parts[:4]
        inst_id_str = str(inst_id).strip()
        base_dir = Path(cfg["download_dir"]) / base_name
        meta_path = base_dir / "meta.json"
        if not meta_path.exists():
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": "meta.json 不存在"})
            remaining_lines.append(line)
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as e:
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": f"meta.json 读取失败: {e}"})
            remaining_lines.append(line)
            continue

        instances = meta.get("instances") or []
        target = next((i for i in instances if str(i.get("id")) == inst_id_str), None)
        if not target:
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": "meta 中未找到该实例"})
            remaining_lines.append(line)
            continue

        api_url = target.get("apiUrl") or f"https://makerworld.com.cn/api/v1/design-service/instance/{inst_id_str}/f3mf?type=download&fileType="
        try:
            inst_id_int = int(inst_id_str)
        except Exception:
            inst_id_int = inst_id_str

        try:
            name3mf, dl_url = fetch_instance_3mf(session, inst_id_int, cookie, api_url)
        except Exception as e:
            logger.error("实例 %s 获取 3MF 失败: %s", inst_id_str, e)
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": f"接口获取失败: {e}"})
            remaining_lines.append(line)
            continue

        if not dl_url:
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": "未返回下载地址"})
            remaining_lines.append(line)
            continue

        inst_dir = base_dir / "instances"
        inst_dir.mkdir(parents=True, exist_ok=True)
        file_name = pick_instance_filename(target, name3mf)
        dest = inst_dir / file_name
        used_existing = False
        try:
            if dest.exists():
                used_existing = True
                logger.info("实例 %s 已存在文件 %s，跳过重新下载", inst_id_str, dest)
            else:
                download_file(session, dl_url, dest)
        except Exception as e:
            logger.error("实例 %s 下载 3MF 失败: %s", inst_id_str, e)
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": f"下载失败: {e}"})
            remaining_lines.append(line)
            continue

        target["downloadUrl"] = dl_url
        if name3mf:
            target["name"] = name3mf
        try:
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            details.append({"status": "fail", "base_name": base_name, "inst_id": inst_id_str, "message": f"写入 meta.json 失败: {e}"})
            remaining_lines.append(line)
            continue

        success_cnt += 1
        details.append({
            "status": "ok",
            "base_name": base_name,
            "inst_id": inst_id_str,
            "file": dest.name,
            "used_existing": used_existing,
            "downloadUrl": dl_url,
        })
        logger.info("实例 %s 下载完成 -> %s", inst_id_str, dest)

    failed_cnt = len(lines) - success_cnt
    missing_log.write_text("\n".join(remaining_lines), encoding="utf-8")
    return {"processed": len(lines), "success": success_cnt, "failed": failed_cnt, "details": details}


def scan_gallery(cfg) -> List[dict]:
    root = Path(cfg["download_dir"])
    items = []
    for d in root.glob("MW_*"):
        meta = d / "meta.json"
        if not meta.exists():
            continue
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            items.append({
                "baseName": data.get("baseName") or d.name,
                "title": data.get("title"),
                "id": data.get("id"),
                "cover": (d / "images" / data.get("images", {}).get("cover", "")).name if data.get("images") else "",
                "dir": d.name,
                "tags": data.get("tags") or [],
            })
        except Exception:
            continue
    return items


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CFG = load_config()


app.mount("/files", StaticFiles(directory=CFG["download_dir"], html=True), name="files")


@app.get("/")
async def gallery_page():
    return FileResponse(BASE_DIR / "templates" / "gallery.html")


@app.get("/config")
async def config_page():
    return FileResponse(BASE_DIR / "templates" / "config.html")


@app.get("/api/config")
async def api_config():
    cfg = load_config()
    cookie_path = Path(cfg["cookie_file"])
    cookie_time = cookie_path.stat().st_mtime if cookie_path.exists() else None
    return {
        "download_dir": cfg["download_dir"],
        "logs_dir": cfg["logs_dir"],
        "cookie_file": cfg["cookie_file"],
        "cookie_updated_at": datetime.fromtimestamp(cookie_time).isoformat() if cookie_time else None,
    }


@app.post("/api/cookie")
async def api_cookie(body: dict):
    cookie = (body or {}).get("cookie", "")
    if not cookie.strip():
        raise HTTPException(400, "cookie 不能为空")
    write_cookie(CFG, cookie)
    return {"status": "ok", "updated_at": datetime.now().isoformat()}


@app.post("/api/archive")
async def api_archive(body: dict):
    url = (body or {}).get("url", "").strip()
    if not url:
        raise HTTPException(400, "url 不能为空")
    cookie = read_cookie(CFG)
    if not cookie:
        raise HTTPException(400, "请先设置 cookie")
    try:
        logger.info("使用 Cookie 片段: %s", cookie[:200])
        result = archive_model(url, cookie, Path(CFG["download_dir"]), Path(CFG["logs_dir"]), logger)
        return {"status": "ok", **result}
    except requests.HTTPError as e:
        # 输出更多上下文（状态码与前 300 字符）
        resp = e.response
        snippet = ""
        if resp is not None:
            snippet = (resp.text or "")[:300]
            logger.error("归档失败 HTTP %s: %s", resp.status_code, snippet)
        else:
            logger.error("归档失败 HTTP: %s", e)
        raise HTTPException(500, f"归档失败: {e} 片段: {snippet}")
    except Exception as e:
        logger.exception("归档失败")
        raise HTTPException(500, f"归档失败: {e}")


@app.get("/api/logs/missing-3mf")
async def api_missing():
    return parse_missing(CFG)


@app.post("/api/logs/missing-3mf/redownload")
async def api_redownload_missing():
    cookie = read_cookie(CFG)
    if not cookie:
        raise HTTPException(400, "请先设置 cookie")
    try:
        result = retry_missing_downloads(CFG, cookie)
        return {"status": "ok", **result}
    except Exception as e:
        logger.exception("缺失 3MF 重试下载失败")
        raise HTTPException(500, f"重试下载失败: {e}")


@app.delete("/api/logs/missing-3mf/{index:int}")
async def api_delete_missing(index: int):
    missing_log = Path(CFG["logs_dir"]) / "missing_3mf.log"
    if not missing_log.exists():
        raise HTTPException(404, "日志不存在")
    
    lines = missing_log.read_text(encoding="utf-8").splitlines()
    if index < 0 or index >= len(lines):
        raise HTTPException(400, "索引超出范围")
    
    lines.pop(index)
    missing_log.write_text("\n".join(lines), encoding="utf-8")
    logger.info("删除缺失记录 #%d", index)
    return {"status": "ok"}


@app.get("/api/gallery")
async def api_gallery():
    return scan_gallery(CFG)


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
