#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
脚本说明：
- 扫描指定目录下的全部 3MF 文件，按模型自动整理到独立文件夹。
- 同模型的不同配置放入同一目录，并按配置名重命名文件。
- 完全重复的配置会集中放入根目录下的重复目录，并输出文本总结报告。

用法：
  python3 scripts/organize_local_3mf.py
  python3 scripts/organize_local_3mf.py --root D:\\path\\to\\folder
  python3 scripts/organize_local_3mf.py --root D:\\path\\to\\folder --dry-run
  python3 scripts/organize_local_3mf.py --root D:\\path\\to\\folder --mode copy
  python3 scripts/organize_local_3mf.py --root D:\\path\\to\\folder --limit 10
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from time import perf_counter
from typing import Dict, Iterable, List, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = REPO_ROOT / "app"
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from archiver import sanitize_filename  # noqa: E402
from three_mf_parser import parse_3mf_to_session  # noqa: E402


ORGANIZED_DIR_NAME = "整理完成"
DUPLICATES_DIR_NAME = "重复文件"
REPORTS_DIR_NAME = "整理报告"
FAILED_DIR_NAME = "整理失败"
MANIFEST_NAME = "organize_manifest.json"
OUTPUT_DIR_NAMES = {
    ORGANIZED_DIR_NAME,
    DUPLICATES_DIR_NAME,
    REPORTS_DIR_NAME,
    FAILED_DIR_NAME,
}


@dataclass
class ParsedItem:
    source_path: Path
    source_rel: str
    file_hash: str
    parsed: dict
    model_key: str
    model_key_source: str
    config_fingerprint: str
    config_key_source: str
    model_title: str
    config_title: str


def now_iso() -> str:
    return datetime.now().isoformat()


def format_duration_text(total_seconds: float) -> str:
    seconds = max(int(round(total_seconds or 0)), 0)
    minutes = seconds // 60
    remain_seconds = seconds % 60
    return f"{minutes}分{remain_seconds}秒"


def normalize_key_text(value: str) -> str:
    return " ".join(str(value or "").strip().lower().split())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            if chunk:
                digest.update(chunk)
    return digest.hexdigest()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def ensure_3mf_name(name: str, fallback: str) -> str:
    raw = sanitize_filename(str(name or "")).strip()
    if not raw:
        raw = fallback
    stem = raw[:-4] if raw.lower().endswith(".3mf") else raw
    stem = stem.strip() or fallback
    return f"{stem}.3mf"


def ensure_unique_path(dest: Path) -> Path:
    if not dest.exists():
        return dest
    stem = dest.stem or "file"
    suffix = dest.suffix
    index = 2
    while True:
        candidate = dest.with_name(f"{stem}_{index}{suffix}")
        if not candidate.exists():
            return candidate
        index += 1


def derive_model_key(parsed: dict, fallback_name: str) -> Tuple[str, str]:
    metadata = parsed.get("metadata") if isinstance(parsed.get("metadata"), dict) else {}
    design_model_id = str(metadata.get("DesignModelId") or "").strip()
    if design_model_id:
        return f"design_model:{design_model_id}", "DesignModelId"
    title = normalize_key_text(parsed.get("modelTitle") or parsed.get("profileTitle") or fallback_name)
    designer = normalize_key_text(parsed.get("designer") or "")
    return f"title_designer:{title}|{designer}", "TitleDesigner"


def derive_config_fingerprint(parsed: dict, file_hash: str) -> Tuple[str, str]:
    metadata = parsed.get("metadata") if isinstance(parsed.get("metadata"), dict) else {}
    design_profile_id = str(metadata.get("DesignProfileId") or "").strip()
    if design_profile_id:
        return f"design_profile:{design_profile_id}", "DesignProfileId"
    return f"sha256:{file_hash}", "FileHash"


def build_model_folder_name(parsed: dict, source_path: Path) -> str:
    metadata = parsed.get("metadata") if isinstance(parsed.get("metadata"), dict) else {}
    design_model_id = str(metadata.get("DesignModelId") or "").strip()
    title = sanitize_filename(str(parsed.get("modelTitle") or parsed.get("profileTitle") or source_path.stem)).strip() or "model"
    designer = sanitize_filename(str(parsed.get("designer") or "")).strip()
    if design_model_id:
        if designer:
            return f"MW_{designer}_{title}"
        return f"MW_{title}"
    if designer:
        return f"Others_{designer}_{title}"
    return f"Others_{title}"


def build_config_file_name(parsed: dict, source_path: Path) -> str:
    profile_title = str(parsed.get("profileTitle") or "").strip()
    model_title = str(parsed.get("modelTitle") or "").strip()
    preferred = profile_title or model_title or ""
    normalized = preferred.replace(" ", "")
    if len(normalized) <= 1 or re.fullmatch(r"[\d._-]+", normalized or ""):
        preferred = source_path.stem
    return ensure_3mf_name(preferred or source_path.stem, "config")


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return {"models": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"models": {}}
    if not isinstance(data, dict):
        return {"models": {}}
    models = data.get("models")
    if not isinstance(models, dict):
        models = {}
    return {"models": models}


def save_manifest(path: Path, manifest: dict):
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def iter_candidate_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*"), key=lambda item: str(item).lower()):
        if not path.is_file() or path.suffix.lower() != ".3mf":
            continue
        rel_parts = path.relative_to(root).parts
        if any(part in OUTPUT_DIR_NAMES for part in rel_parts):
            continue
        yield path


def parse_item(path: Path, reports_dir: Path, root: Path) -> ParsedItem:
    file_hash = sha256_file(path)
    file_bytes = path.read_bytes()
    with tempfile.TemporaryDirectory(prefix="organize_3mf_", dir=str(reports_dir)) as temp_dir:
        parsed = parse_3mf_to_session(file_bytes, path.name, Path(temp_dir), 1)
    model_key, model_key_source = derive_model_key(parsed, path.stem)
    config_fingerprint, config_key_source = derive_config_fingerprint(parsed, file_hash)
    model_title = str(parsed.get("modelTitle") or parsed.get("profileTitle") or path.stem).strip() or path.stem
    config_title = str(parsed.get("profileTitle") or parsed.get("modelTitle") or path.stem).strip() or path.stem
    return ParsedItem(
        source_path=path,
        source_rel=str(path.relative_to(root)),
        file_hash=file_hash,
        parsed=parsed,
        model_key=model_key,
        model_key_source=model_key_source,
        config_fingerprint=config_fingerprint,
        config_key_source=config_key_source,
        model_title=model_title,
        config_title=config_title,
    )


def move_or_copy_file(source: Path, dest: Path, mode: str):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if mode == "copy":
        shutil.copy2(source, dest)
    else:
        shutil.move(str(source), str(dest))


def create_record(manifest: dict, item: ParsedItem, organized_dir: Path) -> dict:
    models = manifest.setdefault("models", {})
    record = models.get(item.model_key)
    if isinstance(record, dict):
        return record

    folder_name = build_model_folder_name(item.parsed, item.source_path)
    model_dir = ensure_unique_path(organized_dir / folder_name)
    record = {
        "folder_name": model_dir.name,
        "model_title": item.model_title,
        "model_key_source": item.model_key_source,
        "configs": {},
    }
    models[item.model_key] = record
    return record


def write_report(path: Path, summary: dict, details: List[dict]):
    lines: List[str] = []
    lines.append("3MF 整理报告")
    lines.append("=" * 40)
    lines.append(f"生成时间: {summary['generated_at']}")
    lines.append(f"根目录: {summary['root']}")
    lines.append(f"执行模式: {summary['mode']}")
    lines.append(f"预览模式: {'是' if summary['dry_run'] else '否'}")
    lines.append(f"扫描文件数: {summary['scanned_files']}")
    lines.append(f"整理模型数: {summary['organized_models']}")
    lines.append(f"整理配置数: {summary['organized_configs']}")
    lines.append(f"重复数量: {summary['duplicate_count']}")
    lines.append(f"失败数量: {summary['failed_count']}")
    lines.append(f"整理耗时: {summary['duration_text']}")
    lines.append("")

    model_groups = summary.get("models") or []
    if model_groups:
        lines.append("模型汇总")
        lines.append("-" * 40)
        for group in model_groups:
            lines.append(f"[{group['folder_name']}] {group['model_title']}")
            lines.append(f"  配置数: {group['config_count']}")
            lines.append(f"  配置列表: {', '.join(group['config_names'])}")
        lines.append("")

    duplicate_rows = [row for row in details if row.get("action") == "duplicate"]
    if duplicate_rows:
        lines.append("重复文件")
        lines.append("-" * 40)
        for row in duplicate_rows:
            lines.append(f"- {row['source']} -> {row['dest']}")
        lines.append("")

    failed_rows = [row for row in details if row.get("action") == "failed"]
    if failed_rows:
        lines.append("失败文件")
        lines.append("-" * 40)
        for row in failed_rows:
            lines.append(f"- {row['source']}: {row['message']}")
        lines.append("")

    path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="整理本地 3MF 文件")
    parser.add_argument("--root", default=".", help="待整理的根目录，默认当前目录")
    parser.add_argument("--mode", choices=["move", "copy"], default="move", help="整理时移动还是复制，默认 move")
    parser.add_argument("--dry-run", action="store_true", help="只分析和生成报告，不落盘")
    parser.add_argument("--limit", type=int, default=0, help="仅处理前 N 个文件，用于测试")
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()
    start_time = perf_counter()

    root = Path(args.root).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        print(f"ERROR: 根目录不存在或不是目录: {root}", file=sys.stderr)
        return 1

    organized_dir = ensure_dir(root / ORGANIZED_DIR_NAME)
    duplicates_dir = ensure_dir(root / DUPLICATES_DIR_NAME)
    reports_dir = ensure_dir(root / REPORTS_DIR_NAME)
    failed_dir = ensure_dir(root / FAILED_DIR_NAME)
    manifest_path = reports_dir / MANIFEST_NAME
    manifest = load_manifest(manifest_path)

    candidates = list(iter_candidate_files(root))
    if args.limit and args.limit > 0:
        candidates = candidates[: args.limit]

    if not candidates:
        print(f"未找到可整理的 3MF 文件: {root}")
        return 0

    details: List[dict] = []
    model_stats: Dict[str, dict] = {}
    organized_configs = 0
    duplicate_count = 0
    failed_count = 0

    for path in candidates:
        try:
            item = parse_item(path, reports_dir, root)
        except Exception as exc:
            failed_count += 1
            failed_dest = ensure_unique_path(failed_dir / ensure_3mf_name(path.name, path.stem or "failed"))
            details.append(
                {
                    "action": "failed",
                    "source": str(path.relative_to(root)),
                    "dest": str(failed_dest.relative_to(root)),
                    "message": str(exc),
                }
            )
            if not args.dry_run:
                move_or_copy_file(path, failed_dest, args.mode)
            continue

        record = create_record(manifest, item, organized_dir)
        configs = record.setdefault("configs", {})
        model_dir = organized_dir / record["folder_name"]

        if item.config_fingerprint in configs:
            duplicate_count += 1
            duplicate_dest = ensure_unique_path(duplicates_dir / ensure_3mf_name(path.name, path.stem or "duplicate"))
            details.append(
                {
                    "action": "duplicate",
                    "source": item.source_rel,
                    "dest": str(duplicate_dest.relative_to(root)),
                    "model_key": item.model_key,
                    "config_fingerprint": item.config_fingerprint,
                }
            )
            if not args.dry_run:
                move_or_copy_file(path, duplicate_dest, args.mode)
            continue

        dest_name = build_config_file_name(item.parsed, path)
        dest_path = ensure_unique_path(model_dir / dest_name)
        details.append(
            {
                "action": "organized",
                "source": item.source_rel,
                "dest": str(dest_path.relative_to(root)),
                "model_key": item.model_key,
                "config_fingerprint": item.config_fingerprint,
            }
        )

        if not args.dry_run:
            move_or_copy_file(path, dest_path, args.mode)

        configs[item.config_fingerprint] = {
            "file_name": dest_path.name,
            "config_title": item.config_title,
            "file_hash": item.file_hash,
            "config_key_source": item.config_key_source,
            "updated_at": now_iso(),
        }
        organized_configs += 1

        stat = model_stats.setdefault(
            item.model_key,
            {
                "folder_name": record["folder_name"],
                "model_title": record.get("model_title") or item.model_title,
                "config_names": [],
            },
        )
        stat["config_names"].append(dest_path.name)

    if not args.dry_run:
        save_manifest(manifest_path, manifest)

    model_summaries = []
    for row in sorted(model_stats.values(), key=lambda item: item["folder_name"].lower()):
        names = sorted(row["config_names"], key=str.lower)
        model_summaries.append(
            {
                "folder_name": row["folder_name"],
                "model_title": row["model_title"],
                "config_count": len(names),
                "config_names": names,
            }
        )

    summary = {
        "generated_at": now_iso(),
        "root": str(root),
        "mode": args.mode,
        "dry_run": bool(args.dry_run),
        "scanned_files": len(candidates),
        "organized_models": len(model_summaries),
        "organized_configs": organized_configs,
        "duplicate_count": duplicate_count,
        "failed_count": failed_count,
        "models": model_summaries,
        "duration_seconds": max(perf_counter() - start_time, 0.0),
    }
    summary["duration_text"] = format_duration_text(summary["duration_seconds"])

    report_name = "organize_report_preview.txt" if args.dry_run else f"organize_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    report_path = reports_dir / report_name
    write_report(report_path, summary, details)

    print("")
    print("3MF 整理完成")
    print(f"根目录: {root}")
    print(f"扫描文件: {summary['scanned_files']}")
    print(f"模型数量: {summary['organized_models']}")
    print(f"配置数量: {summary['organized_configs']}")
    print(f"重复数量: {summary['duplicate_count']}")
    print(f"失败数量: {summary['failed_count']}")
    print(f"整理耗时: {summary['duration_text']}")
    print(f"报告文件: {report_path}")
    print("")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
