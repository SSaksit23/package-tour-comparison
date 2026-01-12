@echo off
chcp 65001 >nul
cd /d "%~dp0"
git add -A
git status
echo.
echo Ready to commit. Press any key to see files to be committed...
pause >nul
