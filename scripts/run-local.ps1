param(
    [string]$DatabaseUrl = 'postgres://flagstudio:flagstudio@localhost:5432/flagstudio?sslmode=disable',
    [string]$ListenAddress = '127.0.0.1:8080',
    [switch]$SkipWebBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not (Get-Command go -ErrorAction SilentlyContinue)) { throw '请先安装 Go 1.24 或更新版本，并加入 PATH。' }
if (-not $SkipWebBuild) {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24（含 npm），并加入 PATH。' }
    Push-Location (Join-Path $root 'web')
    try {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci 失败' }
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
    } finally { Pop-Location }
}
$env:DATABASE_URL = $DatabaseUrl
$env:HTTP_ADDR = $ListenAddress
$env:SEED_DEMO = 'true'
$env:STATIC_DIR = Join-Path $root 'web/dist'
Push-Location (Join-Path $root 'backend')
try {
    Write-Host "Flag Studio: http://$ListenAddress（Ctrl+C 停止；数据库须已启动）"
    & go run .
    if ($LASTEXITCODE -ne 0) { throw "Go 服务退出：$LASTEXITCODE" }
} finally { Pop-Location }
