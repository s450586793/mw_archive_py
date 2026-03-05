<#
脚本说明：
- 用于“一键发布”当前版本：同步版本号 -> 提交 -> 打 tag -> 推送分支与 tag。
- 版本来源为仓库根目录 version.yml 的 project_version。
- 当 tag（如 v5.2.0）推送到远端后，GitHub Actions 会自动创建 Release。
- 可选参数：
  -Message "自定义提交信息"
#>

param(
  [string]$Message = ""
)

# 出错立即终止，避免半成功状态（例如打了 tag 但未成功推送）
$ErrorActionPreference = "Stop"

# 计算仓库根目录（当前脚本位于 scripts/ 下）
$repoRoot = Split-Path -Parent $PSScriptRoot
$versionFile = Join-Path $repoRoot "version.yml"
$syncScript = Join-Path $repoRoot "scripts/sync_version.py"
$readmeFile = Join-Path $repoRoot "README.md"

function Get-ReadmeCurrentVersionSection {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    throw "README.md 不存在: $Path"
  }

  $text = Get-Content $Path -Raw -Encoding UTF8
  # 提取“## 当前版本”到下一个二级标题之间的内容
  $match = [regex]::Match($text, '(?ms)^##\s*当前版本\s*\r?\n(.*?)(?=^##\s+|\z)')
  if (-not $match.Success) {
    throw "README.md 中未找到 `## 当前版本` 区块"
  }

  return $match.Groups[1].Value.Trim()
}

# 基础校验：版本配置文件必须存在
if (-not (Test-Path $versionFile)) {
  throw "version.yml 不存在: $versionFile"
}

# 从 version.yml 提取 project_version（要求 X.Y.Z）
$projectVersion = ""
Get-Content $versionFile | ForEach-Object {
  if ($_ -match '^\s*project_version\s*:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$') {
    $projectVersion = $Matches[1]
  }
}

if (-not $projectVersion) {
  throw "version.yml 中未找到 project_version"
}

# 规范化 tag 格式：v<project_version>
$tag = "v$projectVersion"

# 若未传入提交信息，使用默认模板
if (-not $Message) {
  $Message = "chore: release $tag"
}

# 切换到仓库根目录执行后续命令，确保路径与 git 上下文正确
Push-Location $repoRoot
try {
  # 先同步版本号到各目标文件：
  # 优先 python3；若环境只存在 python，则退回 python。
  if (Get-Command python3 -ErrorAction SilentlyContinue) {
    python3 $syncScript
  } elseif (Get-Command python -ErrorAction SilentlyContinue) {
    python $syncScript
  } else {
    throw "未找到可用 Python（需要 python3 或 python）"
  }

  # 发布前确认：展示当前版本号与 README 中的更新说明，人工确认后才继续
  $currentVersionSection = Get-ReadmeCurrentVersionSection -Path $readmeFile
  Write-Host ""
  Write-Host "================ 发布前确认 ================" -ForegroundColor Cyan
  Write-Host "版本号: $tag" -ForegroundColor Yellow
  Write-Host "提交信息: $Message" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "README -> ## 当前版本 内容:"
  Write-Host $currentVersionSection
  Write-Host "============================================" -ForegroundColor Cyan
  Write-Host ""

  $confirm = Read-Host "确认以上内容无误并继续执行 commit/tag/push ? 输入 y 继续，其它任意键取消"
  if ($confirm -ne "y" -and $confirm -ne "Y") {
    throw "已取消发布操作（未执行 commit/tag/push）"
  }

  # 仅添加发布相关文件，避免误把工作区其它变更一并提交
  $releaseFiles = @(
    "version.yml",
    "README.md",
    "app/templates/config.html",
    "plugin/tampermonkey/mw_quick_archive.user.js",
    "plugin/chrome_extension/mw_quick_archive_ext/manifest.json",
    "scripts/sync_version.py",
    "scripts/build_release_notes.py",
    ".github/workflows/release.yml",
    "scripts/release_tag.ps1"
  )
  git add -- $releaseFiles

  # 若有暂存变更则提交；否则跳过 commit（但仍可继续打 tag）
  $hasStaged = git diff --cached --name-only
  if ($hasStaged) {
    git commit -m $Message
  } else {
    Write-Host "没有可提交的变更，跳过 commit。"
  }

  # 防止覆盖已有 tag，保证发布版本不可变
  $tagExists = git tag --list $tag
  if ($tagExists) {
    throw "tag 已存在: $tag"
  }

  # 本地打 tag，并推送当前分支和该 tag
  git tag $tag
  git push origin HEAD
  git push origin $tag

  # 推送 tag 后会触发 .github/workflows/release.yml 自动创建 Release
  Write-Host "已发布 tag: $tag"
  Write-Host "GitHub Actions 将自动创建 Release。"
} finally {
  # 无论成功失败都恢复原始目录
  Pop-Location
}
