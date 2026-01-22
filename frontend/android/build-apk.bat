@echo off
cd /d "%~dp0"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
echo Using JAVA_HOME: %JAVA_HOME%
echo Current directory: %CD%
"%JAVA_HOME%\bin\java" -version
call "%~dp0gradlew.bat" assembleDebug
