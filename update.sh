#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# update.sh - MakerWorld 项目更新与部署脚本
#
# 功能说明:
# 1) 进入指定 Git 仓库执行 `git pull`
# 2) 判断是否有代码更新:
#    - 有更新: 正常执行构建 + 重启部署
#    - 无更新: 提示是否继续执行“重新部署”
# 3) 打印整理后的 Git 更新日志（默认最多 3 条）
#
# 典型使用:
#   bash update.sh
#
# 交互行为:
# - 当 `git pull` 后未检测到新提交（HEAD 未变化）时，会询问:
#   "是否继续执行重新部署？[y/N]"
# - 输入 y / yes 才继续，其他输入或回车默认取消部署并退出
#
# 前置条件:
# - 已安装 git
# - BUILD_SCRIPT 和 RUN_SCRIPT 均存在且可执行
#
# 退出码约定:
# - 0: 正常完成（包含用户选择不继续部署的正常退出）
# - 非 0: 发生错误（如 git 失败、脚本不存在等）
# ==============================================================================

# =========================
# 配置区
# =========================
BASE_DIR="/home/docker/mw_archive"
REPO_DIR="${BASE_DIR}/mw_archive_py"
BUILD_SCRIPT="${REPO_DIR}/docker_build.sh"
RUN_SCRIPT="${BASE_DIR}/docker_run.sh"
LOG_COUNT=3

# =========================
# 工具函数
# =========================
ts() { date '+%Y-%m-%d %H:%M:%S'; }
info() { echo -e "[INFO]  $(ts)  $*"; }
warn() { echo -e "[WARN]  $(ts)  $*"; }
err()  { echo -e "[ERROR] $(ts)  $*" >&2; }
die()  { err "$*"; exit 1; }

ask_continue_redeploy() {
  local answer=""
  if [ ! -t 0 ]; then
    warn "检测到无交互终端，默认不继续重新部署。"
    return 1
  fi
  read -r -p "未检测到代码更新，是否继续执行重新部署？[y/N] " answer
  case "${answer}" in
    y|Y|yes|YES|Yes) return 0 ;;
    *) return 1 ;;
  esac
}

# =========================
# 前置检查
# =========================
info "开始更新与部署流程"
info "基础目录: ${BASE_DIR}"
info "代码目录: ${REPO_DIR}"

command -v git >/dev/null 2>&1 || die "未找到 git，请先安装 git"
[ -d "${REPO_DIR}" ] || die "目录不存在: ${REPO_DIR}"
[ -x "${BUILD_SCRIPT}" ] || die "构建脚本不存在或不可执行: ${BUILD_SCRIPT}（可执行权限 chmod +x ${BUILD_SCRIPT}）"
[ -x "${RUN_SCRIPT}" ] || die "运行脚本不存在或不可执行: ${RUN_SCRIPT}（可执行权限 chmod +x ${RUN_SCRIPT}）"

# =========================
# 进入仓库并 pull
# =========================
cd "${REPO_DIR}"

info "进入仓库目录，准备执行 git pull ..."
# 记录更新前的 HEAD，用于判断是否有更新，并生成更新范围日志
OLD_HEAD="$(git rev-parse HEAD)"

PULL_OUTPUT="$(git pull 2>&1)" || die "git pull 执行失败"
echo "${PULL_OUTPUT}"

NEW_HEAD="$(git rev-parse HEAD)"
HAS_UPDATE=1
# 判断是否无更新（git pull 常见提示 + HEAD 对比双保险）
if echo "${PULL_OUTPUT}" | grep -qiE "Already up[ -]to[ -]date|已经是最新"; then
  HAS_UPDATE=0
elif [ "${OLD_HEAD}" = "${NEW_HEAD}" ]; then
  HAS_UPDATE=0
fi

if [ "${HAS_UPDATE}" -eq 0 ]; then
  warn "本次未检测到代码更新（HEAD 未变化）。"
  if ask_continue_redeploy; then
    info "用户选择继续执行重新部署。"
  else
    info "用户取消重新部署，脚本结束。"
    exit 0
  fi
else
  info "检测到代码有更新：${OLD_HEAD:0:7} -> ${NEW_HEAD:0:7}"
fi

# =========================
# 收集更新日志（整理后的最新 3 次）
# 优先输出“本次更新范围”的提交；如不足 3 条，再补足最新提交
# =========================
info "整理 git 更新日志（最多 ${LOG_COUNT} 条）..."
RANGE_LOG="$(git log --no-merges --pretty=format:'- %h | %ad | %an | %s' --date=short "${OLD_HEAD}..${NEW_HEAD}" | head -n "${LOG_COUNT}" || true)"

if [ -n "${RANGE_LOG}" ]; then
  GIT_LOG="${RANGE_LOG}"
else
  # 兜底：如果范围日志为空（极少数情况，比如复杂 rebase），直接取最新 3 条
  GIT_LOG="$(git log -n "${LOG_COUNT}" --no-merges --pretty=format:'- %h | %ad | %an | %s' --date=short)"
fi

# =========================
# 执行构建
# =========================
info "开始执行构建脚本: ${BUILD_SCRIPT}"
bash "${BUILD_SCRIPT}"
info "构建完成"

# =========================
# 回到上级执行 docker_run.sh
# =========================
cd "${BASE_DIR}"

info "返回基础目录，开始执行运行脚本: ${RUN_SCRIPT}"
bash "${RUN_SCRIPT}"
info "运行脚本执行完成"

# =========================
# 最终输出
# =========================
echo
info "✅ 更新与部署完成！本次整理后的 Git 更新日志："
echo "${GIT_LOG}"
echo

