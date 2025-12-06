# Mobile App Build Guide

Complete guide to building and deploying RavenLoom as an Android app.

## Prerequisites

- **Node.js** 18+
- **Java Development Kit (JDK)** 17+ - [Download](https://adoptium.net/)
- **Android Studio** - [Download](https://developer.android.com/studio)

### Environment Variables (Windows)
```
ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Java\jdk-17
```

## Quick Start

### 1. Install Java (if needed)
```bash
# Using Chocolatey
choco install microsoft-openjdk17

# Verify
java -version
```

### 2. Build the App
```bash
# Build frontend
cd frontend && npm run build

# Sync to Android
npx cap sync android

# Build APK
cd android && ./gradlew assembleDebug
```

**Output:** `android/app/build/outputs/apk/debug/app-debug.apk`

## Development Workflow

### Hot Reload (Fast Development)
1. Start backend: `cd backend && node index.js`
2. Start Vite: `cd frontend && npm run dev`
3. Update `capacitor.config.ts`:
   ```typescript
   server: {
     url: 'http://10.0.2.2:5173', // Emulator localhost
     cleartext: true,
   }
   ```
4. Open Android Studio: `npx cap open android`
5. Run (Shift+F10) - changes hot-reload!

### Production Build
1. Build frontend: `npm run build`
2. Sync: `npx cap sync android`
3. Build release: `./gradlew bundleRelease`

## App Icons

### Generate All Sizes
Using [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html):
1. Upload `frontend/public/raven.png` (1024x1024)
2. Set background: #0D0D0D
3. Download and extract to `android/app/src/main/res/`

### Required Sizes
| Density | Size | Location |
|---------|------|----------|
| mdpi | 48x48 | `mipmap-mdpi/ic_launcher.png` |
| hdpi | 72x72 | `mipmap-hdpi/ic_launcher.png` |
| xhdpi | 96x96 | `mipmap-xhdpi/ic_launcher.png` |
| xxhdpi | 144x144 | `mipmap-xxhdpi/ic_launcher.png` |
| xxxhdpi | 192x192 | `mipmap-xxxhdpi/ic_launcher.png` |

## Signing for Release

### Generate Keystore
```bash
keytool -genkey -v -keystore ravenloom-release.keystore \
  -alias ravenloom -keyalg RSA -keysize 2048 -validity 10000
```

**Keep this file safe!** Required for all future updates.

### Configure Signing
Create `frontend/android/keystore.properties`:
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=ravenloom
storeFile=../../ravenloom-release-key.keystore
```

Update `android/app/build.gradle` to read signing config.

### Build Signed Release
```bash
cd frontend/android
./gradlew bundleRelease
```

**Output:** `android/app/build/outputs/bundle/release/app-release.aab`

## Testing

### Android Emulator
1. Android Studio → Tools → Device Manager
2. Create Virtual Device (Pixel 6, API 33+)
3. Run app

### Physical Device
1. Enable Developer Mode: Settings → About Phone → Tap Build Number 7x
2. Enable USB Debugging: Settings → Developer Options
3. Connect USB and run from Android Studio

### Install via ADB
```bash
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Google Play Store

### Setup
1. Create account at [Play Console](https://play.google.com/console) ($25 fee)
2. Create new app
3. Fill store listing (description, screenshots, icon)
4. Complete content rating questionnaire
5. Upload `.aab` file
6. Submit for review (1-7 days)

### Required Assets
- App icon: 512x512 PNG
- Feature graphic: 1024x500 PNG
- Screenshots: At least 2 (16:9)
- Privacy policy URL

## Troubleshooting

### Gradle Build Fails
```bash
./gradlew clean
./gradlew build --stacktrace
```

### Capacitor Sync Issues
```bash
npx cap sync android --force
```

### App Crashes on Launch
```bash
adb logcat | grep -i "ravenloom"
```

## Command Reference

```bash
# Development
npm run dev                 # Vite dev server
npx cap run android         # Run on device
npx cap open android        # Open Android Studio

# Building
npm run build               # Build web assets
npx cap sync android        # Sync to Android
npx cap copy android        # Copy web assets only

# Gradle (from frontend/android/)
./gradlew assembleDebug     # Debug APK
./gradlew assembleRelease   # Release APK
./gradlew bundleRelease     # AAB for Play Store
./gradlew installDebug      # Build + install
./gradlew clean             # Clean build

# ADB
adb devices                 # List devices
adb install -r app.apk      # Install app
adb logcat                  # View logs
```

## Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/guide)
- [Play Console](https://play.google.com/console)
