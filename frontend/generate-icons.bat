@echo off
REM Generate all icon sizes for RavenLoom
REM Requires ImageMagick: choco install imagemagick

echo Checking for ImageMagick...
magick -version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: ImageMagick not found!
    echo.
    echo Please install ImageMagick:
    echo   1. Download from: https://imagemagick.org/script/download.php
    echo   2. Or use chocolatey: choco install imagemagick
    echo.
    echo Alternative: Use online tool at https://realfavicongenerator.net/
    pause
    exit /b 1
)

echo.
echo Generating browser favicons...
magick public\raven.png -resize 16x16 public\raven-16x16.png
magick public\raven.png -resize 32x32 public\raven-32x32.png
magick public\raven.png -resize 180x180 public\raven-180x180.png
magick public\raven.png -resize 192x192 public\raven-192x192.png
magick public\raven.png -resize 512x512 public\raven-512x512.png

echo.
echo Creating Android icon directories...
mkdir android\app\src\main\res\mipmap-mdpi 2>nul
mkdir android\app\src\main\res\mipmap-hdpi 2>nul
mkdir android\app\src\main\res\mipmap-xhdpi 2>nul
mkdir android\app\src\main\res\mipmap-xxhdpi 2>nul
mkdir android\app\src\main\res\mipmap-xxxhdpi 2>nul

echo.
echo Generating Android icons...
magick public\raven.png -resize 48x48 android\app\src\main\res\mipmap-mdpi\ic_launcher.png
magick public\raven.png -resize 72x72 android\app\src\main\res\mipmap-hdpi\ic_launcher.png
magick public\raven.png -resize 96x96 android\app\src\main\res\mipmap-xhdpi\ic_launcher.png
magick public\raven.png -resize 144x144 android\app\src\main\res\mipmap-xxhdpi\ic_launcher.png
magick public\raven.png -resize 192x192 android\app\src\main\res\mipmap-xxxhdpi\ic_launcher.png

echo.
echo ========================================
echo   All icons generated successfully!
echo ========================================
echo.
echo Next steps:
echo   1. Update frontend/index.html with favicon links
echo   2. Update frontend/public/manifest.json
echo   3. Rebuild app: npm run build
echo   4. Test in browser and Android
echo.
pause
