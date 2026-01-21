@echo off
setlocal

REM === ГДЕ ВИТРИНА (ШАРА) ===
set SHARE=\\192.168.1.10\опервремя\2026\База данных по АПС

REM === ЗАГРУЗКИ (СТАНДАРТНО) ===
set DOWNLOADS=%USERPROFILE%\Downloads

PowerShell -NoProfile -ExecutionPolicy Bypass ^
  -File "%~dp0export_to_share.ps1" ^
  -SharePath "%SHARE%" ^
  -DownloadsPath "%DOWNLOADS%"

echo.
echo Витрина обновлена.
pause
