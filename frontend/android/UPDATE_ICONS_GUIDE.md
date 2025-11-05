# Update Android Icons - Quick Fix

## The Issue

Your `raven.png` is in the **web assets** folder (`assets/public/`), but Android needs icons in the **native resources** folder (`res/mipmap-*/`).

These are two different systems:
- **Web assets**: Used by the web app content ✅ Already set up
- **Native icons**: Used by Android launcher ❌ Still default Capacitor

## Quick Solution

### Option 1: Use Online Tool (5 minutes, easiest)

1. Go to: https://icon.kitchen/
2. Upload your `raven.png` from `frontend/public/`
3. Configure:
   - **Icon Type**: Android Launcher Icon
   - **Background**: Custom → `#0D0D0D`
   - **Shape**: Full bleed (no shape masking)
   - **Padding**: None or 5%
4. Click **Download**
5. Extract the ZIP
6. **Copy/replace** all folders into:
   ```
   frontend/android/app/src/main/res/
   ```
   This will replace:
   - `mipmap-mdpi/ic_launcher.png`
   - `mipmap-hdpi/ic_launcher.png`
   - `mipmap-xhdpi/ic_launcher.png`
   - `mipmap-xxhdpi/ic_launcher.png`
   - `mipmap-xxxhdpi/ic_launcher.png`

7. Rebuild:
   ```bash
   cd frontend/android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

### Option 2: Use @capacitor/assets CLI (Automated)

If you want to automate everything including splash screens:

```bash
cd frontend

# Install the tool
npm install -g @capacitor/assets

# This will automatically generate all Android icons and splash screens
npx @capacitor/assets generate --android
```

**Note**: This requires your icon to be at `frontend/resources/icon.png` (1024x1024)

So first copy your icon:
```bash
mkdir -p resources
cp public/raven.png resources/icon.png
```

Then run the generator. It will create:
- All launcher icon sizes
- All splash screen sizes (portrait and landscape)

### Option 3: Manual Copy with ImageMagick

If you have ImageMagick installed:

```bash
cd frontend

# Create a script to resize
magick public/raven.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
magick public/raven.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
magick public/raven.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
magick public/raven.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
magick public/raven.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

# For round icons
magick public/raven.png -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
magick public/raven.png -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
magick public/raven.png -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
magick public/raven.png -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
magick public/raven.png -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
```

## For Splash Screens

Your splash screens also need updating. Same process:

### Online Tool:
Use: https://apetools.webprofusion.com/app/#/tools/imagegorilla
- Upload `raven.png`
- Select "Android Splash Screens"
- Background: `#0D0D0D`
- Download and replace in `frontend/android/app/src/main/res/drawable*/`

### Or use @capacitor/assets:
```bash
# First create a splash screen image (2732x2732px with logo centered)
# Save as resources/splash.png

npx @capacitor/assets generate --android
```

## After Updating

1. **Rebuild**:
   ```bash
   cd frontend/android
   ./gradlew clean
   ./gradlew assembleDebug
   ```

2. **Install**:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Check**: Look at your app launcher icon - should be the raven now!

## Verify Files

After generation, verify these exist and show your raven logo:
```bash
ls -lh android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
# Should be your raven, not ~4KB Capacitor icon
```

View the file:
```bash
# Windows
start android/app/src/main/res/mipmap-xhdpi/ic_launcher.png

# Mac
open android/app/src/main/res/mipmap-xhdpi/ic_launcher.png

# Linux
xdg-open android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
```

## TL;DR

**You put the files in the right place for the web app, but Android needs them in a different place for the native launcher icon.**

Quickest fix: Use https://icon.kitchen/ to generate and download, then replace the mipmap folders.
