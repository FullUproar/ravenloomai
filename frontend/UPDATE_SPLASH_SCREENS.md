# Update Android Splash Screens

Your **app launcher icons are now perfect!** ✅ The raven logo is correctly installed.

Now let's update the **splash screens** (the screen shown when the app starts).

## Current Status

- ✅ **App Icons**: Raven logo installed correctly
- ❌ **Splash Screens**: Still showing default Capacitor blue icon

## Quick Solution (5 minutes)

### Option 1: Use Capacitor Assets CLI (Easiest & Best)

This will auto-generate all splash screens from your icon:

```bash
cd frontend

# Create resources folder
mkdir -p resources

# Copy your icon
cp public/raven.png resources/icon.png

# Install and run the generator
npx @capacitor/assets generate --android
```

This automatically creates:
- All splash screen sizes (portrait and landscape)
- Proper dark background (#0D0D0D)
- Centered logo

### Option 2: Use Online Tool

1. Go to: https://apetools.webprofusion.com/app/#/tools/imagegorilla
2. Upload your `frontend/public/raven.png`
3. Select: **"Android - Splash Screens"**
4. Configure:
   - Background color: `#0D0D0D`
   - Logo size: Medium (centered)
5. Download ZIP
6. Extract and replace files in: `frontend/android/app/src/main/res/drawable*/`

### Option 3: Keep It Simple (Use Icon as Splash)

If you want the splash to match your icon exactly (black circle with purple raven):

```bash
cd frontend/android/app/src/main/res

# Copy the launcher icon to all splash locations
cp mipmap-hdpi/ic_launcher.png drawable-port-hdpi/splash.png
cp mipmap-mdpi/ic_launcher.png drawable-port-mdpi/splash.png
cp mipmap-xhdpi/ic_launcher.png drawable-port-xhdpi/splash.png
cp mipmap-xxhdpi/ic_launcher.png drawable-port-xxhdpi/splash.png
cp mipmap-xxxhdpi/ic_launcher.png drawable-port-xxxhdpi/splash.png

# Landscape
cp mipmap-hdpi/ic_launcher.png drawable-land-hdpi/splash.png
cp mipmap-mdpi/ic_launcher.png drawable-land-mdpi/splash.png
cp mipmap-xhdpi/ic_launcher.png drawable-land-xhdpi/splash.png
cp mipmap-xxhdpi/ic_launcher.png drawable-land-xxhdpi/splash.png
cp mipmap-xxxhdpi/ic_launcher.png drawable-land-xxxhdpi/splash.png

# Default
cp mipmap-xhdpi/ic_launcher.png drawable/splash.png
```

This makes the splash screen identical to your app icon.

## After Updating Splash Screens

Rebuild and test:

```bash
cd frontend/android
./gradlew clean
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

When you launch the app, you'll see:
1. **Raven logo** on dark background (splash - 2 seconds)
2. Fade to your app

## Verify Everything

After rebuilding, check both:

1. **App Icon** (in launcher): ✅ Should show raven
2. **Splash Screen** (when opening): Should show raven (not Capacitor blue)

---

**Recommendation**: Use **Option 1** (@capacitor/assets) - it's automated and creates perfectly sized splash screens!
