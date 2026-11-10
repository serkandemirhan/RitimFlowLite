@echo off
powershell.exe -NoProfile -File "%~dp0..\scripts\windows\start-demo-presentation.ps1"
if errorlevel 1 pause
