@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Project\jobflow-planner\scripts\Start-JobFlow.ps1"
if errorlevel 1 (
  echo.
  echo Press any key to close this window...
  pause >nul
)
