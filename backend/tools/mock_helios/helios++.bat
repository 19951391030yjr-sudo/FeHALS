@echo off
set PYTHONIOENCODING=utf-8
python "%~dp0mock_helios.py" %*
exit /b %ERRORLEVEL%