# Icon Setup - Quick Summary

## ✅ What's Already Done

1. **HTML Updated** (`frontend/index.html`)
   - Favicon links added for 16x16 and 32x32
   - Apple touch icon links for iOS
   - Manifest link for PWA

2. **Manifest Updated** (`frontend/public/manifest.json`)
   - References corrected icon filenames
   - Theme colors set (#5D4B8C purple, #0D0D0D dark)

3. **Original Icon** (`frontend/public/raven.png`)
   - 1024x1024 PNG - Perfect size! ✅
   - Beautiful purple Celtic knot raven design

## 🔨 What You Need to Do

### Step 1: Generate Icon Sizes (5 minutes)

**Easiest Method** - Use online tool:
1. Go to: https://realfavicongenerator.net/
2. Upload `frontend/public/raven.png`
3. Download the generated package
4. Extract files to `frontend/public/`

This creates:
- `raven-16x16.png`
- `raven-32x32.png`
- `raven-180x180.png`
- `raven-192x192.png`
- `raven-512x512.png`

**See**: [GENERATE_ICONS_ONLINE.md](GENERATE_ICONS_ONLINE.md) for detailed instructions

### Step 2: Generate Android Icons (5 minutes)

1. Go to: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. Upload `frontend/public/raven.png`
3. Set:
   - Name: `ic_launcher`
   - Background: `#0D0D0D`
   - Shape: None
4. Download and extract
5. Copy `res/` folders to `frontend/android/app/src/main/res/`

### Step 3: Test (2 minutes)

**Browser:**
```bash
cd frontend
npm run dev
```
Open http://localhost:5173 - check browser tab icon

**Android:**
```bash
cd frontend/android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```
Check app icon in launcher

## 📂 Expected File Structure

After generating icons:

```
frontend/
├── public/
│   ├── raven.png (1024x1024) ✅ Already exists
│   ├── raven-16x16.png ⬅️ Need to generate
│   ├── raven-32x32.png ⬅️ Need to generate
│   ├── raven-180x180.png ⬅️ Need to generate
│   ├── raven-192x192.png ⬅️ Need to generate
│   ├── raven-512x512.png ⬅️ Need to generate
│   └── manifest.json ✅ Already updated
│
└── android/app/src/main/res/
    ├── mipmap-mdpi/ic_launcher.png (48x48) ⬅️ Need to generate
    ├── mipmap-hdpi/ic_launcher.png (72x72) ⬅️ Need to generate
    ├── mipmap-xhdpi/ic_launcher.png (96x96) ⬅️ Need to generate
    ├── mipmap-xxhdpi/ic_launcher.png (144x144) ⬅️ Need to generate
    └── mipmap-xxxhdpi/ic_launcher.png (192x192) ⬅️ Need to generate
```

## 🎯 Total Time: ~12 minutes

The code is already updated. You just need to generate the icon files!

## 📚 Full Documentation

- **[ICON_SETUP.md](../ICON_SETUP.md)** - Complete guide with all options
- **[GENERATE_ICONS_ONLINE.md](GENERATE_ICONS_ONLINE.md)** - Step-by-step online generation

## 💡 Your Icon is Perfect!

Your 1024x1024 `raven.png` is the ideal size and will scale beautifully to all platforms. The purple Celtic knot raven design is striking and memorable - perfect for RavenLoom! 🪶
