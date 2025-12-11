# MakerWorld 模型归档助手（本地资料库版）指南

本工具包含两部分：

- 油猴脚本 `5.0.js`：在 MakerWorld 模型详情页一键采集模型信息，下载截图、图片、打印配置（实例）详情、3MF 直链等，生成 `*_meta.json`。
- Python 脚本 `5.0.py`：在本地根据 `*_meta.json` 和已下载的资源重新整理目录，生成可离线浏览的 `index.html`。

## 使用步骤

1. **安装油猴脚本**
   - 在浏览器 Tampermonkey 中新建脚本，粘贴 `5.0.js`。
   - 访问 MakerWorld 模型详情页（如 `https://makerworld.com.cn/zh/models/...`），右上角会出现“🚀 归档模型”按钮。

2. **采集数据**
   - 打开模型详情页，点击“🚀 归档模型”。
   - 浏览器下载目录会生成一组文件，文件名前缀形如 `MW_{设计ID}_{标题}_`，包含：
     - 截图：`..._screenshot.png`
     - 封面/设计图：`..._design_XX.ext`
     - 描述区图片：`..._summary_img_XX.ext`
     - 作者头像：`..._author_avatar.ext`
     - 打印配置相关图片：`..._inst{实例ID}_plate_XX.ext`、`..._inst{实例ID}_pic_XX.ext`
     - `..._meta.json`（核心结构化数据）
     - （如未触发风控）不下载 3MF，仅保存直链

3. **本地整理与生成页面**
   - 将下载的所有文件放在同一目录（或保持浏览器默认下载目录）。
   - 在该目录运行：`python3 5.0.py`
   - 脚本会为每个 `MW_*_meta.json` 创建同名子目录，搬运/重命名资源，并生成：
     ```
     MW_{ID}_{Title}/
       ├─ index.html
       ├─ style.css
       ├─ meta.json         # 原 meta 副本
       ├─ images/           # 封面、设计图、描述图、实例配图、plate 缩略图
       └─ instances/        # 下载的 3MF（如采集到直链且可下载）
     ```
   - 用浏览器打开对应的 `index.html` 即可离线浏览。

## 油猴脚本采集内容（`5.0.js`）

- 截图：截取 `.mw-css-1b8wkj` 主图区域。
!- 设计图：优先选择 `/design/` 路径图片；按文件名去重，同名优先 `w_1000` 版本；首张作为 cover。
- 描述区：`data-id="1"` 区域，保留 HTML/文本，替换图片为本地引用。
- 作者信息：姓名、主页、头像。
- 打印配置（实例）：
  - 基础信息：title、publishTime、download/print 次数、预测时长、重量、材质数量、颜色数、needAms。
  - 耗材列表：类型、颜色、用量。
  - 盘信息：缩略图（plate_xx.png）、预测时长、重量、耗材。
  - 实例配图：实拍/配置图。
  - 3MF 直链：通过接口获取，不下载文件。
- 生成 `*_meta.json`，附带 baseName 以便本地整理。

## meta.json 结构说明（主要字段）

```jsonc
{
  "baseName": "MW_XXXX_Title",
  "url": "原始模型链接",
  "id": 123,
  "slug": "...",
  "title": "...",
  "titleTranslated": "...",
  "coverUrl": "原始封面 URL（若有）",
  "tags": [],
  "tagsOriginal": [],
  "stats": { "likes": 0, "favorites": 0, "downloads": 0, "prints": 0, "views": 0 },
  "cover": { "url": "...", "localName": "design_01.jpg", "relPath": "images/design_01.jpg" },
  "author": { "name": "...", "url": "...", "avatarUrl": "...", "avatarLocal": "author_avatar.png", "avatarRelPath": "images/author_avatar.png" },
  "images": {
    "cover": "design_01.jpg",
    "design": ["design_01.jpg", ...],
    "summary": ["summary_img_01.jpg", ...]
  },
  "designImages": [ { "index": 1, "originalUrl": "...", "relPath": "images/design_01.jpg", "fileName": "design_01.jpg" }, ... ],
  "summaryImages": [ { "index": 1, "originalUrl": "...", "relPath": "images/summary_img_01.jpg", "fileName": "summary_img_01.jpg" }, ... ],
  "summary": { "raw": "<...远程HTML>", "html": "<...本地引用HTML>", "text": "纯文本" },
  "instances": [
    {
      "id": 123,
      "profileId": 456,
      "title": "...",
      "titleTranslated": "...",
      "publishTime": "2025-01-01T00:00:00Z",
      "downloadCount": 0,
      "printCount": 0,
      "prediction": 14782,      // 秒
      "weight": 65,             // 克
      "materialCnt": 3,
      "materialColorCnt": 3,
      "needAms": false,
      "plates": [
        {
          "index": 1,
          "prediction": 8259,
          "weight": 39,
          "filaments": [ { "type": "PLA", "color": "#000000", "usedG": "18" } ],
          "thumbnailUrl": "...",
          "thumbnailRelPath": "images/inst{ID}_plate_01.png",
          "thumbnailFile": "inst{ID}_plate_01.png"
        }
      ],
      "pictures": [
        {
          "index": 1,
          "url": "...",
          "relPath": "images/inst{ID}_pic_01.jpg",
          "fileName": "inst{ID}_pic_01.jpg",
          "isRealLifePhoto": 1
        }
      ],
      "instanceFilaments": [ { "type": "PLA", "color": "#FFFFFF", "usedG": "20" } ],
      "summary": "",
      "summaryTranslated": "",
      "name": "xxx.3mf",
      "downloadUrl": "https://...3mf直链",
      "apiUrl": "https://...f3mf?..."
    }
  ],
  "generatedAt": "ISO时间",
  "note": "说明"
}
```

## 生成后的目录结构

```
./
├─ MW_XXXX_Title_meta.json   # 油猴生成的 meta
├─ ..._screenshot.png        # 油猴下载的截图
├─ ..._design_01.jpg         # 设计图
├─ ..._summary_img_01.jpg    # 描述图
├─ ..._author_avatar.png     # 作者头像
├─ ..._inst{ID}_plate_01.png # 实例盘缩略图
├─ ..._inst{ID}_pic_01.jpg   # 实例配图
└─ 运行 python3 5.0.py 后生成 ->
   └─ MW_XXXX_Title/
      ├─ index.html          # 离线浏览页
      ├─ style.css           # 样式
      ├─ meta.json           # 原始 meta 副本
      ├─ images/             # 所有图片（已去前缀）
      └─ instances/          # 下载的 3MF（若获取到）
```

## 注意事项
- `5.0.js` 默认只记录 3MF 直链，不下载 3MF；`5.0.py` 会尝试下载 3MF 到 `instances/`。
- 若 3MF 接口触发人机校验，请在网页手动点击一次下载后再运行采集。
- 设计图、描述图去重和本地引用均已处理；实例图、plate 缩略图会移除前缀。
- 运行 `5.0.py` 请使用 Python 3，路径中含中文/空格建议在同级目录执行避免编码问题。

## 快速命令

```bash
# 采集后本地整理
python3 5.0.py

# 如果只想处理某个目录，进入该目录再执行
cd /path/to/downloads && python3 5.0.py
```
