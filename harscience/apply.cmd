@echo off
setlocal
rem Double-click entry point: integrate Agent-ClaudeCode into the installed HarScience.
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%Integrate-AgentClaudeCode.ps1" %*
echo.
pause