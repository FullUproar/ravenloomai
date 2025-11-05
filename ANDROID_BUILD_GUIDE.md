# Android Build Guide for RavenLoom

Complete guide to building and deploying the RavenLoom Android app.

## Prerequisites

### Required Software
- **Node.js** 18+ (already installed)
- **Java Development Kit (JDK)** 17+
  - Download from: https://www.oracle.com/java/technologies/downloads/
  - Or use OpenJDK: https://adoptium.net/
- **Android Studio** (latest stable)
  - Download from: https://developer.android.com/studio
  - Install Android SDK, Platform Tools, and Build Tools
- **Gradle** (bundled with project - `gradlew`)

### Android SDK Setup
1. Open Android Studio
2. Go to **Tools > SDK Manager**
3. Install:
   - Android SDK Platform 33+ (targetSdkVersion)
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Google Play Services (optional)

### Environment Variables (Windows)
Add to your system PATH:
```
ANDROID_HOME=C:\Users\YourName\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Java\jdk-17
```

## Project Structure

```
ravenloom/
├── frontend/                    # React + Vite web app
│   ├── src/                     # React components
│   ├── dist/                    # Built web assets (for Capacitor)
│   ├── android/                 # Android native project
│   │   ├── app/                 # Main Android app module
│   │   │   ├── src/main/
│   │   │   │   ├── AndroidManifest.xml
│   │   │   │   ├── java/        # Native Android code
│   │   │   │   └── res/         # Android resources
│   │   │   └── build.gradle     # App-level build config
│   │   ├── build.gradle         # Project-level build config
│   │   └── gradlew              # Gradle wrapper (use this!)
│   ├── capacitor.config.ts      # Capacitor configuration
│   └── package.json
└── backend/                     # Node.js GraphQL API
```

## Build Process Overview

The RavenLoom app uses **Capacitor** to wrap the React web app in a native Android container.

### Build Flow:
1. Build React app → `frontend/dist/`
2. Sync web assets to Android → `android/app/src/main/assets/public`
3. Build Android APK/AAB using Gradle

## Step-by-Step Build Instructions

### 1. Start Backend Server

The Android app needs the backend running to function.

```bash
cd backend
npm install
node index.js
```

Server will start on **http://localhost:4000**

Verify GraphQL playground: http://localhost:4000/graphql

### 2. Build Frontend Web App

```bash
cd frontend
npm install
npm run build
```

This creates optimized production assets in `frontend/dist/`

### 3. Sync to Android Project

```bash
cd frontend
npx cap sync android
```

This command:
- Copies `dist/` contents to `android/app/src/main/assets/public`
- Updates Capacitor plugins
- Updates AndroidManifest.xml

### 4. Update Capacitor Config for Production

Edit `frontend/capacitor.config.ts`:

```typescript
const config: CapacitorConfig = {
  appId: 'com.ravenloom.app',
  appName: 'RavenLoom',
  webDir: 'dist',
  server: {
    androidScheme: 'https', // Use HTTPS in production
    // Remove or comment out 'url' for production (uses bundled assets)
    // url: 'http://10.0.2.2:5173', // Only for dev
  },
  plugins: {
    // ... plugin config
  }
};
```

**Development mode**: Use `url: 'http://10.0.2.2:5173'` to hot-reload from Vite dev server
**Production mode**: Remove `url` to use bundled assets

### 5. Build Android Debug APK

```bash
cd frontend/android
./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 6. Build Android Release APK (Unsigned)

```bash
cd frontend/android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

### 7. Build Android App Bundle (for Play Store)

```bash
cd frontend/android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

## Development Workflow

### Option A: Hot Reload with Vite (Fastest)

1. Start backend:
   ```bash
   cd backend && node index.js
   ```

2. Start Vite dev server:
   ```bash
   cd frontend && npm run dev
   ```

3. Update `capacitor.config.ts`:
   ```typescript
   server: {
     url: 'http://10.0.2.2:5173', // Emulator localhost
     cleartext: true,
   }
   ```

4. Open in Android Studio:
   ```bash
   cd frontend
   npx cap open android
   ```

5. Run app from Android Studio (Shift+F10)

Changes to React code will hot-reload on the device!

### Option B: Build and Install (Slower, but tests production build)

1. Build frontend:
   ```bash
   cd frontend && npm run build
   ```

2. Sync to Android:
   ```bash
   npx cap sync android
   ```

3. Build and install APK:
   ```bash
   cd android
   ./gradlew installDebug
   ```

## Testing on Physical Device

### Enable USB Debugging
1. Go to **Settings > About Phone**
2. Tap **Build Number** 7 times (enables Developer Options)
3. Go to **Settings > Developer Options**
4. Enable **USB Debugging**

### Install APK via ADB
```bash
# Connect device via USB
adb devices

# Install app
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

### Wireless Debugging (Android 11+)
1. Enable **Wireless Debugging** in Developer Options
2. Pair device:
   ```bash
   adb pair <ip>:<port>
   ```
3. Connect:
   ```bash
   adb connect <ip>:<port>
   ```

## Signing for Release (Play Store)

### Generate Signing Key

```bash
keytool -genkey -v -keystore ravenloom-release-key.keystore \
  -alias ravenloom -keyalg RSA -keysize 2048 -validity 10000
```

Save the keystore file securely (do NOT commit to Git!)

### Configure Signing in Gradle

Create `frontend/android/keystore.properties`:
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=ravenloom
storeFile=../../ravenloom-release-key.keystore
```

Update `frontend/android/app/build.gradle`:
```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

android {
    signingConfigs {
        release {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Build Signed Release

```bash
cd frontend/android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

Upload this `.aab` file to Google Play Console.

## Troubleshooting

### Gradle Build Fails
```bash
cd frontend/android
./gradlew clean
./gradlew build --stacktrace
```

### Clear Gradle Cache
```bash
cd frontend/android
./gradlew clean
rm -rf .gradle
rm -rf app/build
```

### Capacitor Sync Issues
```bash
cd frontend
npx cap sync android --force
```

### Android Studio Can't Find JDK
- Go to **File > Project Structure > SDK Location**
- Set JDK location to your installed JDK path

### App Crashes on Launch
- Check `adb logcat` for errors:
  ```bash
  adb logcat | grep -i "ravenloom"
  ```
- Verify backend is accessible from device
- Check `capacitor.config.ts` server URL

## Performance Optimization

### Reduce APK Size
- Enable ProGuard/R8 minification
- Remove unused resources
- Use WebP images
- Enable code splitting in Vite

### Improve Load Time
- Enable gzip compression in backend
- Use lazy loading for routes
- Optimize images
- Minimize bundle size

## Continuous Integration

### GitHub Actions Example
```yaml
name: Build Android

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Setup JDK
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install dependencies
        run: cd frontend && npm install

      - name: Build web app
        run: cd frontend && npm run build

      - name: Sync Capacitor
        run: cd frontend && npx cap sync android

      - name: Build APK
        run: cd frontend/android && ./gradlew assembleDebug

      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: app-debug
          path: frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

## Next Steps

1. ✅ Database migrations complete
2. ✅ Backend GraphQL API ready
3. ✅ Frontend React app built
4. ✅ Persona creation UI integrated
5. ✅ Capacitor Android project configured
6. 🔄 Build and test Android APK
7. 🔄 Deploy backend to production (Render/Railway/Vercel)
8. 🔄 Update Android app to use production API
9. 🔄 Test on physical devices
10. 🔄 Submit to Google Play Store

## Useful Commands Reference

```bash
# Development
npm run dev                        # Start Vite dev server
npx cap run android                # Run on connected device/emulator
npx cap open android               # Open in Android Studio

# Building
npm run build                      # Build web app
npx cap sync android               # Sync to Android
npx cap copy android               # Copy web assets only

# Android (from frontend/android/)
./gradlew tasks                    # List all available tasks
./gradlew assembleDebug            # Build debug APK
./gradlew assembleRelease          # Build release APK
./gradlew bundleRelease            # Build AAB for Play Store
./gradlew installDebug             # Build and install debug
./gradlew clean                    # Clean build artifacts

# ADB
adb devices                        # List connected devices
adb install -r app.apk             # Install/update app
adb uninstall com.ravenloom.app    # Uninstall app
adb logcat                         # View device logs
adb shell                          # Open device shell
```

## Resources

- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Developer Guide](https://developer.android.com/guide)
- [Gradle User Manual](https://docs.gradle.org/current/userguide/userguide.html)
- [Google Play Console](https://play.google.com/console)
- [Firebase for Android](https://firebase.google.com/docs/android/setup)
