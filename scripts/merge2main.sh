#!/usr/bin/env bash

# 脚本说明：
# - 通过 GitHub PR 方式将 dev 合并到 main（不需要切换分支）。
# - 执行前会展示提交差异与文件变更统计，仅一次人工确认后继续。
# - 若已存在 dev -> main 的打开状态 PR，则复用该 PR 直接执行合并。
# - 合并策略使用 merge commit（等价于 gh pr merge --merge）。
# - 若环境中未安装 gh，脚本会自动降级为纯 git 模式：
#   使用临时 worktree 在后台完成 merge commit 并 push 到 base 分支。
#
# 用法：
#   bash scripts/merge2main.sh
#   bash scripts/merge2main.sh --base main --head dev
#
# 依赖：
# - git
# - gh（可选；安装并登录后可走 PR 合并链路）

set -euo pipefail

BASE_BRANCH="main"
HEAD_BRANCH="dev"

# 解析可选参数，便于后续复用脚本处理其他分支对。
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      if [[ $# -lt 2 ]]; then
        echo "错误：--base 需要一个分支名参数"
        exit 1
      fi
      BASE_BRANCH="$2"
      shift 2
      ;;
    --head)
      if [[ $# -lt 2 ]]; then
        echo "错误：--head 需要一个分支名参数"
        exit 1
      fi
      HEAD_BRANCH="$2"
      shift 2
      ;;
    *)
      echo "错误：未知参数 $1"
      echo "用法：bash scripts/merge2main.sh [--base main] [--head dev]"
      exit 1
      ;;
  esac
done

# 基础命令可用性检查，避免执行到中途才失败。
if ! command -v git >/dev/null 2>&1; then
  echo "错误：未找到 git 命令"
  exit 1
fi

# 确保当前目录在 git 仓库内。
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "错误：当前目录不是 git 仓库"
  exit 1
fi

# 检测 gh 可用性：
# - 仅当“安装了 gh 且已登录”时启用 PR 合并链路
# - 否则自动使用纯 git 降级链路，避免脚本直接中断
GH_AVAILABLE="false"
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    GH_AVAILABLE="true"
  else
    echo "提示：检测到 gh 命令但未登录，将使用纯 git 模式合并。"
  fi
else
  echo "提示：未检测到 gh 命令，将使用纯 git 模式合并。"
fi

echo "正在同步远端分支信息..."
git fetch origin "$BASE_BRANCH" "$HEAD_BRANCH" >/dev/null

# 约束：base 分支必须存在于远端。
if ! git show-ref --verify --quiet "refs/remotes/origin/$BASE_BRANCH"; then
  echo "错误：远端分支 origin/$BASE_BRANCH 不存在"
  exit 1
fi

# PR 创建依赖远端 head 分支，因此必须存在 origin/$HEAD_BRANCH。
if ! git show-ref --verify --quiet "refs/remotes/origin/$HEAD_BRANCH"; then
  echo "错误：远端分支 origin/$HEAD_BRANCH 不存在，请先 push 分支后再执行"
  exit 1
fi

# 以“远端 base 与远端 head”做最终可合并性判断。
# 若为 0，表示 GitHub 侧没有可创建 PR 的提交，直接停止。
COMMIT_COUNT="$(git rev-list --count "origin/$BASE_BRANCH..origin/$HEAD_BRANCH")"
if [[ "$COMMIT_COUNT" -eq 0 ]]; then
  echo "无需合并：origin/$HEAD_BRANCH 相比 origin/$BASE_BRANCH 没有新增提交。"
  echo "说明 main 与 dev 在可合并方向上已一致，脚本已自动停止。"
  exit 0
fi

echo ""
echo "================ 合并前对比 ================"
echo "目标：$HEAD_BRANCH -> $BASE_BRANCH"
echo "新增提交数：$COMMIT_COUNT"
echo ""
echo "[提交列表]"
git --no-pager log --oneline --no-decorate "origin/$BASE_BRANCH..origin/$HEAD_BRANCH"
echo ""
echo "[文件变更统计]"
git --no-pager diff --stat "origin/$BASE_BRANCH...origin/$HEAD_BRANCH"
echo "============================================"
echo ""

read -r -p "确认以上变更无误并继续执行合并? 输入 y 继续，其它任意键取消: " CONFIRM_DIFF
if [[ "$CONFIRM_DIFF" != "y" && "$CONFIRM_DIFF" != "Y" ]]; then
  echo "已取消操作。"
  exit 1
fi

if [[ "$GH_AVAILABLE" == "true" ]]; then
  # PR 模式：先尝试查找是否已有打开的 PR（避免重复创建）。
  EXISTING_PR_NUMBER="$(gh pr list \
    --base "$BASE_BRANCH" \
    --head "$HEAD_BRANCH" \
    --state open \
    --json number \
    --jq '.[0].number')"

  PR_REF=""
  if [[ -n "$EXISTING_PR_NUMBER" && "$EXISTING_PR_NUMBER" != "null" ]]; then
    PR_REF="$EXISTING_PR_NUMBER"
    echo "检测到已存在打开的 PR：#$PR_REF，将复用该 PR 继续合并。"
  else
    echo "未发现打开的 PR，正在创建新 PR..."
    # 使用 --fill 自动从提交信息生成标题和描述，减少手工输入。
    PR_REF="$(gh pr create --base "$BASE_BRANCH" --head "$HEAD_BRANCH" --fill)"
    echo "PR 已创建：$PR_REF"
  fi

  echo "正在合并 PR..."
  gh pr merge "$PR_REF" --merge --delete-branch=false
else
  # 纯 git 模式：不切换当前工作目录分支，使用临时 worktree 完成 merge。
  TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t merge2main)"
  TMP_BRANCH="tmp_merge_${BASE_BRANCH}_${HEAD_BRANCH}_$$"

  cleanup() {
    # 清理顺序：先移除 worktree，再删除临时本地分支。
    git worktree remove --force "$TMP_DIR" >/dev/null 2>&1 || true
    git branch -D "$TMP_BRANCH" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  echo "正在使用纯 git 模式合并（临时 worktree）..."
  git worktree add -f -B "$TMP_BRANCH" "$TMP_DIR" "origin/$BASE_BRANCH" >/dev/null

  # 在临时 worktree 内执行 merge，避免影响当前分支工作区。
  pushd "$TMP_DIR" >/dev/null
  if ! git merge --no-ff --no-edit "origin/$HEAD_BRANCH"; then
    echo "错误：自动合并失败，存在冲突，请手动处理后再发布。"
    popd >/dev/null
    exit 1
  fi

  # 将合并结果推送到远端 base 分支。
  git push origin "HEAD:$BASE_BRANCH"
  popd >/dev/null
fi

echo ""
echo "合并完成：$HEAD_BRANCH -> $BASE_BRANCH"
