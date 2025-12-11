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

from archiver import archive_model

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
