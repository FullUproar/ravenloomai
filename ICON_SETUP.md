# Icon Setup Guide - RavenLoom

Your `raven.png` (1024x1024) is perfect! Here's how to set it up everywhere.

## ✅ Current Status
- **Source**: `frontend/public/raven.png` (1024x1024 PNG)
- **Design**: Purple Celtic knot raven on dark background
- **Quality**: Perfect for all platforms!

## 🌐 Browser Favicon (Tab Icon)

### 1. Update index.html
File: `frontend/index.html`

```html
<head>
  <link rel="icon" type="image/png" sizes="32x32" href="/raven-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/raven-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/raven-180x180.png">
  <link rel="manifest" href="/manifest.json">
</head>
```

### 2. Generate Favicon Sizes
You need these sizes in `frontend/public/`:
- `raven-16x16.png` (browser tab small)
- `raven-32x32.png` (browser tab standard)
- `raven-180x180.png` (iOS home screen)
- `raven-192x192.png` (Android home screen)
- `raven-512x512.png` (PWA splash screen)

**Option A: Use Online Tool (Easiest)**
1. Go to https://realfavicongenerator.net/
2. Upload your `raven.png`
3. Download the package
4. Extract all files to `frontend/public/`

**Option B: Use ImageMagick (Command Line)**
```bash
cd frontend/public

# Install ImageMagick first if needed
# Windows: choco install imagemagick
# Mac: brew install imagemagick

magick raven.png -resize 16x16 raven-16x16.png
magick raven.png -resize 32x32 raven-32x32.png
magick raven.png -resize 180x180 raven-180x180.png
magick raven.png -resize 192x192 raven-192x192.png
magick raven.png -resize 512x512 raven-512x512.png
```

**Option C: Manual (Photoshop/GIMP/Online)**
Use any image editor to resize `raven.png` to the sizes above.

## 📱 PWA Manifest (Web App Icons)

### Update manifest.json
File: `frontend/public/manifest.json`

```json
{
  "name": "RavenLoom",
  "short_name": "RavenLoom",
  "description": "PM in a box. Just add any human.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0D0D0D",
  "theme_color": "#5D4B8C",
  "icons": [
    {
      "src": "/raven-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/raven-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

## 🤖 Android App Icons

Android needs multiple icon sizes for different screen densities.

### Required Sizes
- **mdpi**: 48x48
- **hdpi**: 72x72
- **xhdpi**: 96x96
- **xxhdpi**: 144x144
- **xxxhdpi**: 192x192

### Adaptive Icons (Modern Android)
Android also supports "adaptive icons" with separate foreground and background layers.

### Option 1: Use Android Asset Studio (Recommended)
1. Go to https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. Upload your `raven.png`
3. Configure:
   - **Name**: ic_launcher
   - **Shape**: None (your image has its own shape)
   - **Background color**: #0D0D0D (matches your dark background)
4. Download ZIP
5. Extract to `frontend/android/app/src/main/res/`

This will create:
```
res/
├── mipmap-mdpi/ic_launcher.png
├── mipmap-hdpi/ic_launcher.png
├── mipmap-xhdpi/ic_launcher.png
├── mipmap-xxhdpi/ic_launcher.png
├── mipmap-xxxhdpi/ic_launcher.png
├── mipmap-anydpi-v26/ic_launcher.xml (adaptive icon)
└── values/ic_launcher_background.xml
```

### Option 2: Manual Resize
```bash
cd frontend/android/app/src/main/res

# Create directories if they don't exist
mkdir -p mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi

# Resize using ImageMagick
magick ../../../../../public/raven.png -resize 48x48 mipmap-mdpi/ic_launcher.png
magick ../../../../../public/raven.png -resize 72x72 mipmap-hdpi/ic_launcher.png
magick ../../../../../public/raven.png -resize 96x96 mipmap-xhdpi/ic_launcher.png
magick ../../../../../public/raven.png -resize 144x144 mipmap-xxhdpi/ic_launcher.png
magick ../../../../../public/raven.png -resize 192x192 mipmap-xxxhdpi/ic_launcher.png
```

### Verify AndroidManifest.xml
File: `frontend/android/app/src/main/AndroidManifest.xml`

Make sure it references the icon:
```xml
<application
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:label="@string/app_name"
    ...>
```

## 🎨 In-App Logo Usage

### Use in React Components
```jsx
import ravenLogo from '/raven.png';

function Header() {
  return (
    <div>
      <img src={ravenLogo} alt="RavenLoom" width="48" height="48" />
      <h1>RavenLoom</h1>
    </div>
  );
}
```

### App.jsx Example
```jsx
<h1 style={{
  fontFamily: "'Cinzel', serif",
  fontSize: 'clamp(1.8rem, 5vw, 2.5rem)',
  color: '#5D4B8C',
  marginTop: '1rem',
  display: 'flex',
  alignItems: 'center',
  gap: '12px'
}}>
  <img src="/raven.png" alt="RavenLoom" style={{ width: '40px', height: '40px' }} />
  RavenLoom
</h1>
```

## 🚀 Quick Setup Script

Create this script to generate all sizes automatically:

**File**: `frontend/generate-icons.sh`
```bash
#!/bin/bash

# Requires ImageMagick: brew install imagemagick or choco install imagemagick

SOURCE="public/raven.png"

# Browser favicons
magick $SOURCE -resize 16x16 public/raven-16x16.png
magick $SOURCE -resize 32x32 public/raven-32x32.png
magick $SOURCE -resize 180x180 public/raven-180x180.png
magick $SOURCE -resize 192x192 public/raven-192x192.png
magick $SOURCE -resize 512x512 public/raven-512x512.png

# Android icons
mkdir -p android/app/src/main/res/mipmap-mdpi
mkdir -p android/app/src/main/res/mipmap-hdpi
mkdir -p android/app/src/main/res/mipmap-xhdpi
mkdir -p android/app/src/main/res/mipmap-xxhdpi
mkdir -p android/app/src/main/res/mipmap-xxxhdpi

magick $SOURCE -resize 48x48 android/app/src/main/res/mipmap-mdpi/ic_launcher.png
magick $SOURCE -resize 72x72 android/app/src/main/res/mipmap-hdpi/ic_launcher.png
magick $SOURCE -resize 96x96 android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
magick $SOURCE -resize 144x144 android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
magick $SOURCE -resize 192x192 android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

echo "✅ All icons generated!"
```

**Run it:**
```bash
cd frontend
chmod +x generate-icons.sh
./generate-icons.sh
```

## ✅ Checklist

After setup, verify:

- [ ] Browser tab shows raven icon
- [ ] manifest.json references new icons
- [ ] Android res/ folder has all mipmap sizes
- [ ] AndroidManifest.xml points to ic_launcher
- [ ] App builds successfully: `./gradlew assembleDebug`
- [ ] Installed Android app shows raven icon
- [ ] PWA on mobile home screen shows raven icon

## 🎯 Summary

Your 1024x1024 `raven.png` is perfect! To complete the setup:

1. **Generate icon sizes** (use online tool or ImageMagick)
2. **Update index.html** with favicon links
3. **Update manifest.json** with PWA icons
4. **Add Android icons** to res/mipmap-* folders
5. **Test** browser tab, PWA, and Android app

The logo looks fantastic - the purple Celtic knot raven design perfectly matches RavenLoom's mystical project management vibe! 🪶
