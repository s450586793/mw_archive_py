#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脚本说明：
- 批量为历史归档的 meta.json 回填 instances[].fileName 字段。
- 适用于旧数据中仅有 title/name，但缺少 fileName 的场景。
- 仅在能解析到真实本地文件时写入，避免误写。

用法：
  python3 scripts/backfill_instance_filename.py
  python3 scripts/backfill_instance_filename.py --dry-run
  python3 scripts/backfill_instance_filename.py --data-root app/data
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Dict, List


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", str(name or "")).strip()


def candidate_instance_names(inst: Dict) -> List[str]:
    """按服务端同等优先级生成候选文件名列表。"""
    out: List[str] = []
    for key in ("fileName", "name", "sourceFileName", "localName", "title"):
        raw = str(inst.get(key) or "").strip()
        if not raw:
            continue
        name = Path(raw).name.strip()
        if not name:
            continue
        out.append(name)
        # 注意：标题可能带 0.16mm 这种小数点，不能简单按 suffix 判断扩展名
        if not name.lower().endswith(".3mf"):
            out.append(f"{name}.3mf")
        else:
            out.append(f"{name}.3mf")  # 兼容历史双后缀
    # 去重保序
    return list(dict.fromkeys(out))


def resolve_instance_filename(inst: Dict, instances_dir: Path) -> str:
    if not instances_dir.exists() or not instances_dir.is_dir():
        return ""
    for name in candidate_instance_names(inst):
        if (instances_dir / name).is_file():
            return name
    return ""


def process_meta(meta_path: Path, dry_run: bool) -> int:
    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
    except Exception:
        return 0
    if not isinstance(data, dict):
        return 0

    instances = data.get("instances")
    if not isinstance(instances, list):
        return 0

    instances_dir = meta_path.parent / "instances"
    changed = 0
    for inst in instances:
        if not isinstance(inst, dict):
            continue
        resolved = resolve_instance_filename(inst, instances_dir)
        if not resolved:
            continue
        current = str(inst.get("fileName") or "").strip()
        if current != resolved:
            inst["fileName"] = resolved
            changed += 1

    if changed and not dry_run:
        meta_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description="批量回填 meta.json 的 instances[].fileName")
    parser.add_argument("--data-root", default="app/data", help="数据根目录（默认 app/data）")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不写文件")
    args = parser.parse_args()

    data_root = Path(args.data_root).resolve()
    if not data_root.exists():
        print(f"[backfill-fileName] 数据目录不存在: {data_root}")
        return 1

    total_meta = 0
    changed_meta = 0
    changed_instances = 0

    for meta_path in sorted(data_root.glob("*/meta.json")):
        total_meta += 1
        changed = process_meta(meta_path, dry_run=args.dry_run)
        if changed > 0:
            changed_meta += 1
            changed_instances += changed
            print(f"[backfill-fileName] {meta_path.parent.name}: +{changed}")

    print(
        f"[backfill-fileName] done. total_meta={total_meta}, "
        f"changed_meta={changed_meta}, changed_instances={changed_instances}, dry_run={args.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
