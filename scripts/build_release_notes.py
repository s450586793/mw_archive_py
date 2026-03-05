#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脚本说明：
- 从 README.md 中提取“## 当前版本”章节内容，生成 Release 正文文件。
- 默认输出到仓库根目录 RELEASE_NOTES.md。
- 供 GitHub Actions 在创建 Release 时自动使用，避免手写重复内容。
"""

from __future__ import annotations

from pathlib import Path
import re
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent
README = REPO_ROOT / "README.md"
OUTPUT = REPO_ROOT / "RELEASE_NOTES.md"


def extract_current_version_section(readme_text: str) -> str:
    # 捕获“## 当前版本”到下一个二级标题之间的内容
    m = re.search(r"(?ms)^##\s*当前版本\s*\n(.*?)(?=^##\s+|\Z)", readme_text)
    if not m:
        raise RuntimeError("README.md 中未找到 `## 当前版本` 章节")
    body = m.group(1).strip()
    if not body:
        raise RuntimeError("`## 当前版本` 章节为空")
    return body


def main() -> int:
    text = README.read_text(encoding="utf-8")
    section = extract_current_version_section(text)
    out = "## 当前版本\n\n" + section + "\n"
    OUTPUT.write_text(out, encoding="utf-8")
    print(f"Wrote: {OUTPUT}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
