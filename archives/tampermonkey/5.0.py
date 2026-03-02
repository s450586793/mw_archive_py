import re
import json
import shutil
from pathlib import Path
from datetime import datetime

import requests

ROOT_DIR = Path(".").resolve()
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (MakerWorld-Local-Archiver)"
})


def log(*args):
    print("[REBUILD]", *args)


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def download_file(url: str, dest: Path):
    if dest.exists():
        log("文件已存在，跳过:", dest)
        return

    try:
        log("下载:", url, "->", dest)
        resp = SESSION.get(url, timeout=30)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
    except Exception as e:
        log("下载失败:", url, "错误:", e)


def find_meta_files(root: Path):
    for p in root.glob("MW_*_meta.json"):
        yield p


def possible_prefixes(base_name: str):
    prefixes = {base_name}
    if base_name.endswith("_"):
        prefixes.add(base_name.rstrip("_"))
    else:
        prefixes.add(base_name + "_")
    return prefixes


def iter_patterns(root: Path, base_name: str, middles):
    for prefix in possible_prefixes(base_name):
        for mid in middles:
            yield from root.glob(prefix + mid)


def strip_prefix(name: str, base_name: str) -> str:
    for prefix in sorted(possible_prefixes(base_name), key=len, reverse=True):
        if name.startswith(prefix):
            return name[len(prefix):]
    return name


STYLE_CSS = """
body {
  font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  margin: 0;
  padding: 0;
  background: #f5f5f5;
  color: #222;
}

.container {
  max-width: 980px;
  margin: 24px auto 40px;
  padding: 24px;
  background: #ffffff;
  box-shadow: 0 0 12px rgba(0,0,0,0.06);
  border-radius: 10px;
}

h1.title {
  font-size: 26px;
  margin: 0 0 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.title a.origin-link {
  font-size: 14px;
  text-decoration: none;
  color: #1976d2;
}

.title a.origin-link::before {
  content: "↗ ";
}

.author {
  margin: 4px 0 14px;
  font-size: 14px;
  color: #555;
  display: flex;
  align-items: center;
  gap: 10px;
}

.author img.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.hero {
  width: 100%;
  max-height: 540px;
  object-fit: contain;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #000;
}

.collect-date {
  font-size: 13px;
  color: #777;
  margin: 0 0 16px;
}

.section-title {
  font-size: 18px;
  margin: 22px 0 10px;
  border-left: 4px solid #1976d2;
  padding-left: 10px;
}

.stats {
  margin: 6px 0 14px;
  color: #666;
  font-size: 14px;
}

.tag-list span {
  display: inline-block;
  background: #e3f2fd;
  padding: 4px 10px;
  margin: 4px 6px 0 0;
  border-radius: 14px;
  font-size: 13px;
}

.summary img {
  max-width: 100%;
  border-radius: 6px;
  margin: 6px 0;
}

.instances .inst-card {
  border: 1px solid #e6e6e6;
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 12px;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.instances .inst-card:hover {
  box-shadow: 0 6px 18px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

.inst-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 13px;
  color: #555;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  background: #f7f7f7;
  border: 1px solid #eee;
}

.meta-item:hover {
  background: #eef5ff;
  border-color: #d0e0ff;
}

.meta-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-left: 6px;
  border-radius: 12px;
  background: #e8f5e9;
  color: #1b5e20;
  font-size: 12px;
  border: 1px solid #c8e6c9;
}

.inst-download {
  margin-left: 6px;
  font-size: 12px;
  text-decoration: none;
  background: #1976d2;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
}

.inst-download:hover {
  background: #0f5fb6;
}

.inst-thumb {
  width: 140px;
  height: 140px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #eee;
  background: #000;
  cursor: zoom-in;
}

.plates {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
}

.plate-item {
  width: 120px;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 6px;
  font-size: 12px;
}

.plate-item img {
  width: 100%;
  height: 70px;
  object-fit: contain;
  border-radius: 6px;
  background: #000;
  cursor: zoom-in;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.chip {
  display: inline-block;
  padding: 2px 8px 2px 6px;
  border-radius: 12px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #e8e8e8;
}

.chip .color-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 6px;
  border: 1px solid #ccc;
  vertical-align: middle;
}

.thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 6px 0 12px;
}

.thumbs img {
  width: 82px;
  height: 82px;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid transparent;
  background: #000;
}

.thumbs img.active {
  border-color: #1976d2;
  box-shadow: 0 0 6px rgba(25, 118, 210, 0.6);
}

.zoomable {
  cursor: zoom-in;
}

.lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 999999;
}

.lightbox img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.4);
}

.lightbox.show {
  display: flex;
}
.carousel {
  position: relative;
  margin: 10px 0 20px;
  overflow: hidden;
  border-radius: 8px;
  background: #000;
}

.carousel-track {
  display: flex;
  transition: transform 0.3s ease;
}

.carousel img {
  width: 100%;
  max-height: 480px;
  object-fit: contain;
  flex-shrink: 0;
  background: #000;
}

.carousel-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  border-radius: 16px;
  border: none;
  background: rgba(0,0,0,0.45);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.carousel-btn:hover {
  background: rgba(0,0,0,0.7);
}

.carousel-btn.prev {
  left: 10px;
}

.carousel-btn.next {
  right: 10px;
}
""".strip()


def normalize_stats(meta: dict) -> dict:
    stats = meta.get("stats") or meta.get("counts") or {}
    likes = stats.get("likes") or stats.get("like") or 0
    favorites = stats.get("favorites") or stats.get("favorite") or 0
    downloads = stats.get("downloads") or stats.get("download") or 0
    prints = stats.get("prints") or stats.get("print") or 0
    views = stats.get("views") or stats.get("read") or stats.get("reads") or 0
    return {
        "likes": likes,
        "favorites": favorites,
        "downloads": downloads,
        "prints": prints,
        "views": views,
    }


def normalize_author(meta: dict) -> dict:
    author_raw = meta.get("author")
    if isinstance(author_raw, str):
        return {"name": author_raw, "url": "", "avatar": None}
    if not isinstance(author_raw, dict):
        return {"name": "", "url": "", "avatar": None}

    avatar_local = author_raw.get("avatarLocal") or author_raw.get("avatar_local")
    avatar_rel = author_raw.get("avatarRelPath") or author_raw.get("avatar_local_path")
    if not avatar_rel and avatar_local:
        avatar_rel = f"images/{avatar_local}"

    return {
        "name": author_raw.get("name") or "",
        "url": author_raw.get("url") or "",
        "avatar": avatar_rel,
    }


def normalize_images(meta: dict) -> dict:
    images_raw = meta.get("images")
    design = []
    summary = []
    cover = None

    def to_name(item):
        if not item:
            return None
        return Path(item).name

    if isinstance(images_raw, dict):
        design = [to_name(x) for x in images_raw.get("design", []) if to_name(x)]
        summary = [to_name(x) for x in images_raw.get("summary", []) if to_name(x)]
        cover = to_name(images_raw.get("cover"))
    elif isinstance(images_raw, list):
        design = [to_name(x) for x in images_raw if to_name(x)]

    if not design and meta.get("designImages"):
        for item in meta.get("designImages", []):
            if isinstance(item, dict):
                val = item.get("fileName") or item.get("localName") or item.get("relPath")
                name = to_name(val)
                if name:
                    design.append(name)

    if not summary and meta.get("summaryImages"):
        for item in meta.get("summaryImages", []):
            if isinstance(item, dict):
                val = item.get("fileName") or item.get("relPath")
                name = to_name(val)
                if name:
                    summary.append(name)
            elif isinstance(item, str):
                name = to_name(item)
                if name:
                    summary.append(name)

    if not cover:
        cover_info = meta.get("cover") or {}
        cover = to_name(cover_info.get("relPath") or cover_info.get("localName"))

    return {"design": design, "summary": summary, "cover": cover}


def format_duration(seconds):
    try:
        sec = int(seconds)
    except Exception:
        return ""
    hours = sec / 3600.0
    if hours >= 1:
        return f"{hours:.1f} h"
    mins = sec / 60.0
    return f"{mins:.1f} min"


def format_date(date_str):
    try:
        if not date_str:
            return ""
        clean = date_str.replace("Z", "+00:00") if str(date_str).endswith("Z") else str(date_str)
        return str(datetime.fromisoformat(clean).date())
    except Exception:
        return date_str or ""


def build_instance_html(inst, assets):
    title = inst.get("title") or inst.get("name") or f"实例 {inst.get('id')}"
    publish = format_date(inst.get("publishTime") or "")
    summary = inst.get("summary") or ""
    dls = inst.get("downloadCount") or 0
    prints = inst.get("printCount") or 0
    weight = inst.get("weight") or ""
    prediction = inst.get("prediction")
    time_str = format_duration(prediction) if prediction else ""
    plates = inst.get("plates") or []
    plate_cnt = len(plates)
    pictures = inst.get("pictures") or []
    filaments = inst.get("instanceFilaments") or []

    base_name = assets.get("base_name") or ""

    def local_name(rel):
        if not rel:
            return ""
        try:
            name = Path(rel).name
        except Exception:
            name = rel
        return strip_prefix(name, base_name) if base_name else name

    inst_file_map = {f.get("id"): f for f in assets.get("instance_files") or [] if f.get("file")}
    inst_local = inst_file_map.get(inst.get("id")) or {}
    dl_href = "./instances/" + inst_local.get("file") if inst_local else (inst.get("downloadUrl") or "#")

    chips = []
    for f in filaments:
        typ = f.get("type") or ""
        used_g = f.get("usedG") or f.get("usedg") or ""
        col = f.get("color") or ""
        dot = f'<span class="color-dot" style="background:{col}"></span>' if col else ""
        chips.append(f"{dot}{typ} {used_g}g".strip())

    chips_html = "\n".join(f'<span class="chip">{c}</span>' for c in chips)

    plates_html = ""
    if plates:
        blocks = []
        for p in plates:
            th = local_name(p.get("thumbnailRelPath") or "")
            pred = format_duration(p.get("prediction")) if p.get("prediction") else ""
            w = p.get("weight")
            fs = p.get("filaments") or []
            fs_html = " ".join(f'{f.get("type")} {f.get("usedG","")}g' for f in fs if f)
            blocks.append(
                f'<div class="plate-item"><img class="zoomable" src="{("./images/"+th) if th else ""}" alt="plate {p.get("index")}">'
                f'<div>Plate {p.get("index")}</div>'
                f'<div>{pred} {str(w)+" g" if w else ""}</div>'
                f'<div>{fs_html}</div>'
                f'</div>'
            )
        plates_html = '<div class="plates">' + "".join(blocks) + "</div>"

    pics_html = ""
    if pictures:
        imgs = []
        for pic in pictures:
            rel = local_name(pic.get("relPath") or "")
            if rel:
                imgs.append(f'<img class="inst-thumb zoomable" src="./images/{rel}" alt="pic {pic.get("index")}">')
        if imgs:
            pics_html = '<div class="thumbs">' + "".join(imgs) + "</div>"

    return f"""
<div class="inst-card">
  <div class="inst-meta">
    <div><strong>{title}</strong> <a class="inst-download" href="{dl_href}" target="_blank" rel="noreferrer">⬇ 下载</a> {"<span class='meta-badge' title='打印盘数'>🧩 "+str(plate_cnt)+" 盘</span>" if plate_cnt else ""}</div>
    {"<div>发布于 "+publish+"</div>" if publish else ""}
  </div>
  <div class="inst-meta"><span class="meta-item" title="下载次数">⬇️ {dls}</span><span class="meta-item" title="打印次数">🖨️ {prints}</span><span class="meta-item" title="预计打印时间">⏱️ {time_str}</span><span class="meta-item" title="重量">⚖️ {weight} g</span></div>
  {"<div class='chips'>"+chips_html+"</div>" if chips_html else ""}
  {pics_html}
  {plates_html}
  {"<div style='margin-top:8px;font-size:13px;color:#444;'>"+summary+"</div>" if summary else ""}
</div>
""".strip()


def build_index_html(meta: dict, assets: dict) -> str:
    title = meta.get("title", "")
    url = meta.get("url", "")
    tags = meta.get("tags") or meta.get("tagsOriginal") or []
    stats = normalize_stats(meta)
    summary_meta = meta.get("summary") or {}
    summary_html_raw = summary_meta.get("html") or summary_meta.get("raw") or ""
    summary_html = re.sub(
        r'<div[^>]*class="[^"]*translated-text[^"]*"[^>]*>.*?</div>',
        "",
        summary_html_raw,
        flags=re.S | re.I,
    )
    images = normalize_images(meta)
    author = normalize_author(meta)

    like_count = stats.get("likes") or 0
    fav_count = stats.get("favorites") or 0
    dl_count = stats.get("downloads") or 0
    print_count = stats.get("prints") or 0
    view_count = stats.get("views") or 0

    tags_html = ""
    if tags:
        tags_html = "\n".join(
            f'<span>{t}</span>' for t in tags
        )

    design_imgs = assets.get("design_files") or images.get("design") or []
    thumbs_html = ""
    carousel_html = ""
    if design_imgs:
        img_tags = "\n".join(
            f'<img src="./images/{fn}" alt="design image">'
            for fn in design_imgs
        )
        thumbs_html = "\n".join(
            f'<img data-idx="{i}" src="./images/{fn}" alt="thumb {i+1}">'
            for i, fn in enumerate(design_imgs)
        )
        carousel_html = f"""
<div class="carousel" id="designCarousel">
  <div class="carousel-track">
    {img_tags}
  </div>
  <button class="carousel-btn prev" type="button">◀</button>
  <button class="carousel-btn next" type="button">▶</button>
</div>
<div class="thumbs" id="designThumbs">
  {thumbs_html}
</div>
""".strip()

    hero_src = assets.get("hero") or "screenshot.png"
    avatar_src = assets.get("avatar")
    collected_date = assets.get("collected_date", "")
    collected_div = f'<div class="collect-date">采集日期：{collected_date}</div>' if collected_date else ""

    author_name = author.get("name", "")
    author_url = author.get("url", "")

    stats_fragments = [f"👍 {like_count}", f"⭐ {fav_count}", f"⬇️ {dl_count}"]
    if print_count:
        stats_fragments.append(f"🖨️ {print_count}")
    if view_count:
        stats_fragments.append(f"👁️ {view_count}")
    stats_line = "　".join(stats_fragments)

    origin_link = f'<a class="origin-link" href="{url}" target="_blank" rel="noreferrer">原文链接</a>' if url else ""
    avatar_html = f'<img class="avatar" src="{avatar_src}" alt="avatar">' if avatar_src else ""
    author_display = (
        f'<a href="{author_url}" target="_blank" rel="noreferrer">{author_name}</a>'
        if author_url else author_name
    )

    # 实例区
    instances = meta.get("instances") or []
    inst_html = ""
    if instances:
        blocks = []
        for inst in instances:
            blocks.append(build_instance_html(inst, assets))
        inst_html = "\n".join(blocks)

    html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>{title}</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div class="container">

  <h1 class="title">
    {title}
    {origin_link}
  </h1>

  <div class="author">
    {avatar_html}
    作者：
    {author_display}
  </div>

  <img class="hero" src="{hero_src}" alt="screenshot">
  {collected_div}

  <div class="stats">
    {stats_line}
  </div>

  <div class="section-title">标签</div>
  <div class="tag-list">
    {tags_html}
  </div>

  <div class="section-title">打印配置 / 实例</div>
  <div class="instances">
    {inst_html}
  </div>

  <div class="section-title">简介</div>

  <!-- 设计图片轮播 -->
  {carousel_html}

  <!-- 描述内容（带本地图片路径） -->
  <div class="summary">
    {summary_html}
  </div>

</div>

<div class="lightbox" id="imgLightbox">
  <img src="" alt="preview">
</div>

<script>
(function() {{
  const carousel = document.getElementById('designCarousel');
  if (!carousel) return;
  const track = carousel.querySelector('.carousel-track');
  const slides = carousel.querySelectorAll('img');
  const prevBtn = carousel.querySelector('.prev');
  const nextBtn = carousel.querySelector('.next');
  const thumbs = document.querySelectorAll('#designThumbs img');
  if (!track || slides.length === 0) return;

  let index = 0;
  function update() {{
    const width = carousel.clientWidth;
    track.style.transform = 'translateX(' + (-index * width) + 'px)';
    thumbs.forEach((t, i) => {{
      if (i === index) t.classList.add('active');
      else t.classList.remove('active');
    }});
  }}

  function go(delta) {{
    index = (index + delta + slides.length) % slides.length;
    update();
  }}

  window.addEventListener('resize', update);
  prevBtn.addEventListener('click', function() {{ go(-1); }});
  nextBtn.addEventListener('click', function() {{ go(1); }});
  thumbs.forEach((t, i) => {{
    t.addEventListener('click', function() {{
      index = i;
      update();
    }});
  }});

  update();
}})();

(function() {{
  const overlay = document.getElementById('imgLightbox');
  const overlayImg = overlay ? overlay.querySelector('img') : null;
  if (!overlay || !overlayImg) return;
  document.querySelectorAll('.zoomable').forEach((img) => {{
    img.addEventListener('click', () => {{
      overlayImg.src = img.src;
      overlay.classList.add('show');
    }});
  }});
  overlay.addEventListener('click', () => {{
    overlay.classList.remove('show');
    overlayImg.src = '';
  }});
}})();
</script>

</body>
</html>
"""
    return html


def rebuild_once(meta_path: Path):
    with meta_path.open("r", encoding="utf-8") as f:
        meta = json.load(f)

    base_name = meta.get("baseName") or meta_path.stem.replace("_meta", "")
    work_dir = meta_path.parent / base_name
    ensure_dir(work_dir)

    log("处理模型:", base_name)

    # 1. 写 meta.json 到目标目录
    target_meta = work_dir / "meta.json"
    if not target_meta.exists():
        shutil.copy2(meta_path, target_meta)

    # 2. 准备子目录
    images_dir = work_dir / "images"
    instances_dir = work_dir / "instances"
    ensure_dir(images_dir)
    ensure_dir(instances_dir)

    # 3. 移动 screenshot
    screenshot_file = None
    for p in iter_patterns(meta_path.parent, base_name, ["_screenshot.*", "screenshot.*"]):
        dst = work_dir / f"screenshot{p.suffix.lower()}"
        if not dst.exists():
            log("移动 screenshot:", p, "->", dst)
            shutil.move(str(p), str(dst))
        screenshot_file = dst
        break
    if not screenshot_file:
        existing = next(iter(work_dir.glob("screenshot.*")), None)
        if existing:
            screenshot_file = existing

    # 4. 封面图 & 作者头像 & design & summary images
    for p in iter_patterns(meta_path.parent, base_name, ["_cover.*", "cover.*"]):
        dst = images_dir / f"cover{p.suffix.lower()}"
        if not dst.exists():
            log("移动 cover:", p, "->", dst)
            shutil.move(str(p), str(dst))
        break

    for p in iter_patterns(meta_path.parent, base_name, ["_author_avatar.*", "author_avatar.*"]):
        dst = images_dir / f"author_avatar{p.suffix.lower()}"
        if not dst.exists():
            log("移动 author_avatar:", p, "->", dst)
            shutil.move(str(p), str(dst))
        break

    for p in iter_patterns(meta_path.parent, base_name, ["_design_*", "design_*"]):
        new_name = strip_prefix(p.name, base_name)
        dst = images_dir / new_name
        if not dst.exists():
            log("移动 design 图片:", p, "->", dst)
            shutil.move(str(p), str(dst))

    for p in iter_patterns(meta_path.parent, base_name, ["_summary_img_*", "summary_img_*"]):
        new_name = strip_prefix(p.name, base_name)
        dst = images_dir / new_name
        if not dst.exists():
            log("移动 summary 图片:", p, "->", dst)
            shutil.move(str(p), str(dst))

    # 5. 实例配图/plate 缩略图
    for p in iter_patterns(meta_path.parent, base_name, ["_inst*_*"]):
        new_name = strip_prefix(p.name, base_name)
        dst = images_dir / new_name
        if not dst.exists():
            log("移动实例图片:", p, "->", dst)
            shutil.move(str(p), str(dst))

    # 6. 下载 3MF 到 instances 目录
    instances = meta.get("instances", []) or []
    inst_files = []
    for inst in instances:
        url = inst.get("downloadUrl")
        if not url:
            continue
        title = inst.get("title") or inst.get("name") or str(inst.get("id"))
        base_fn = sanitize_filename(title) or str(inst.get("id") or "model")
        fn = base_fn + ".3mf"
        dest = instances_dir / fn

        if dest.exists():
            i = 2
            while True:
                cand = instances_dir / f"{base_fn}_{i}.3mf"
                if not cand.exists():
                    dest = cand
                    break
                i += 1

        download_file(url, dest)
        inst_files.append({
            "id": inst.get("id"),
            "title": title,
            "file": dest.name,
        })

    # 7. 写入 style.css
    style_path = work_dir / "style.css"
    style_path.write_text(STYLE_CSS, encoding="utf-8")

    # 8. 生成 index.html
    design_files = sorted([p.name for p in images_dir.glob("design_*")])
    cover_file = next(iter(images_dir.glob("cover.*")), None)
    avatar_file = next(iter(images_dir.glob("author_avatar.*")), None)

    hero_file = screenshot_file or cover_file
    hero_rel = hero_file.relative_to(work_dir).as_posix() if hero_file else "screenshot.png"

    assets = {
        "design_files": design_files,
        "hero": f"./{hero_rel}",
        "avatar": f"./{avatar_file.relative_to(work_dir).as_posix()}" if avatar_file else None,
        "collected_date": datetime.now().strftime("%Y-%m-%d"),
        "instance_files": inst_files,
        "base_name": base_name,
    }

    index_html = build_index_html(meta, assets)
    (work_dir / "index.html").write_text(index_html, encoding="utf-8")

    log("完成:", work_dir)


def main():
    metas = list(find_meta_files(ROOT_DIR))
    if not metas:
        log("未找到任何 MW_*_meta.json 文件")
        return
    for meta_path in metas:
        try:
            rebuild_once(meta_path)
        except Exception as e:
            log("处理失败:", meta_path, "错误:", e)


if __name__ == "__main__":
    main()
