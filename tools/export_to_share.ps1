param(
  [Parameter(Mandatory=$true)][string]$SharePath,
  [Parameter(Mandatory=$true)][string]$DownloadsPath
)

$ErrorActionPreference = "Stop"

function Ensure-Dir([string]$p) {
  if (-not (Test-Path $p)) {
    New-Item -ItemType Directory -Force -Path $p | Out-Null
  }
}

# === 0) Где взять viewer.html из репозитория ===
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path     # ...\tools
$repoRoot  = Resolve-Path (Join-Path $scriptDir "..")             # корень репо
$viewerSrc = Join-Path $repoRoot "viewer\viewer.html"

# === 1) Подготовить папки в шаре ===
Ensure-Dir $SharePath
$backupDir = Join-Path $SharePath "backup"
Ensure-Dir $backupDir

# === 2) Скопировать viewer.html в шару (чтобы не руками) ===
if (-not (Test-Path $viewerSrc)) {
  Write-Host "ERROR: Не найден viewer.html в репозитории: $viewerSrc"
  exit 1
}
Copy-Item -Path $viewerSrc -Destination (Join-Path $SharePath "viewer.html") -Force

# === 3) Найти самый свежий экспорт aps_db_backup*.json в Загрузках ===
$latest = Get-ChildItem -Path $DownloadsPath -Filter "aps_db_backup*.json" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $latest) {
  Write-Host "ERROR: Не найден aps_db_backup*.json в $DownloadsPath"
  Write-Host "Сначала в диспетчере нажми: 💾 Экспорт базы"
  exit 1
}

# === 4) Прочитать JSON экспорта ===
$jsonText = Get-Content -Path $latest.FullName -Raw -Encoding UTF8
$data = $jsonText | ConvertFrom-Json

# ВАЖНО:
# Экспорт в твоём data_base_aps.html содержит поля:
# records, addresses, objects :contentReference[oaicite:0]{index=0}
# Мы просто упаковываем ВСЁ как есть и кладём в window.APS_DB.

$compactJson = $data | ConvertTo-Json -Depth 50 -Compress

# === 5) Сгенерировать data.js в шаре ===
# Это и есть тот "код" который ты спрашивал:
# window.APS_DB = {...};
$js = "window.APS_DB = $compactJson;"
$targetDataJs = Join-Path $SharePath "data.js"
Set-Content -Path $targetDataJs -Value $js -Encoding UTF8

# === 6) Архивировать backup с датой/временем ===
$stamp = (Get-Date).ToString("yyyy-MM-dd_HH-mm")
$targetBackup = Join-Path $backupDir ("aps_db_backup_$stamp.json")
Copy-Item -Path $latest.FullName -Destination $targetBackup -Force

Write-Host "OK:"
Write-Host " - viewer.html -> $SharePath\viewer.html"
Write-Host " - data.js     -> $targetDataJs"
Write-Host " - backup      -> $targetBackup"
