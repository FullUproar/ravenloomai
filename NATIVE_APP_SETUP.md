# 🪶 RavenLoom Native App Setup Guide

Complete guide to building and publishing RavenLoom as a native Android app on Google Play Store.

---

## 📋 Prerequisites

- [x] Node.js & npm installed
- [x] Capacitor installed
- [x] Android platform added
- [ ] Android Studio installed
- [ ] Firebase account created
- [ ] Google Play Console account ($25 one-time fee)

---

## Step 1: Firebase Cloud Messaging Setup

Ravens use Firebase Cloud Messaging (FCM) for native push notifications.

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Project name: `RavenLoom`
4. Enable Google Analytics (recommended)
5. Click "Create project"

### 1.2 Add Android App to Firebase

1. In Firebase Console, click "Add app" → Android icon
2. Fill in:
   - **Android package name**: `com.ravenloom.app`
   - **App nickname**: RavenLoom
   - **Debug signing certificate**: (optional for now)
3. Click "Register app"

### 1.3 Download google-services.json

1. Firebase will generate `google-services.json`
2. Download it
3. Place it in: `frontend/android/app/google-services.json`

```bash
# Make sure it's in the right place:
frontend/
  android/
    app/
      google-services.json  ← Here!
```

### 1.4 Enable Cloud Messaging

1. In Firebase Console → Project Settings
2. Go to "Cloud Messaging" tab
3. Under "Cloud Messaging API (Legacy)" → Enable it
4. Copy the **Server Key** - you'll need this for backend

### 1.5 Add Firebase Config to Backend

Add to `backend/.env`:

```env
FIREBASE_SERVER_KEY=<your-server-key-from-step-1.4>
```

---

## Step 2: Install Android Studio

### 2.1 Download & Install

1. Download from: https://developer.android.com/studio
2. Install with default settings
3. Launch Android Studio
4. Install SDK and build tools when prompted

### 2.2 Open RavenLoom Android Project

```bash
cd frontend
npx cap open android
```

This opens Android Studio with your project.

### 2.3 Configure Gradle (if needed)

Android Studio should auto-configure. If you see errors:

1. File → Project Structure
2. Set SDK Location to your Android SDK path
3. Sync Gradle files

---

## Step 3: Create App Icons & Splash Screen

### 3.1 App Icon Requirements

You need a **1024x1024 PNG** icon (no transparency).

**Quick option**: Use an AI tool or designer to create:
- Background: Dark purple (#0D0D0D)
- Foreground: Raven silhouette in brand purple (#5D4B8C)
- Simple, recognizable design

### 3.2 Generate Icons with Capacitor

```bash
# Install the assets package
npm install @capacitor/assets --save-dev

# Place your icon in the root as icon.png (1024x1024)
# Place splash screen as splash.png (2732x2732)

# Generate all sizes
npx capacitor-assets generate
```

This creates all required icon sizes for Android automatically.

### 3.3 Manual Icon Setup (Alternative)

If auto-generation doesn't work:

1. Use [Android Asset Studio](https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html)
2. Upload your 1024x1024 icon
3. Download the zip
4. Extract to `frontend/android/app/src/main/res/`

---

## Step 4: Test on Emulator/Device

### 4.1 Test on Android Emulator

1. In Android Studio: Tools → Device Manager
2. Create Virtual Device (Pixel 6, API 33+)
3. Click Play ▶️ to run RavenLoom

### 4.2 Test on Physical Device

1. Enable Developer Mode on Android phone:
   - Settings → About Phone
   - Tap "Build number" 7 times
2. Enable USB Debugging:
   - Settings → Developer Options → USB Debugging
3. Connect phone via USB
4. In Android Studio, select your device
5. Click Play ▶️

### 4.3 Test Ravens (Push Notifications)

Once app is running:

```javascript
// In browser console or app:
import { initializeRavens } from './src/native-ravens.js';

// Initialize Ravens
await initializeRavens('test-user-123', 'https://your-api-url.com');

// Send test Raven from backend
```

---

## Step 5: Build Release APK/AAB

### 5.1 Generate Signing Key

```bash
# In Android Studio, or use keytool:
keytool -genkey -v -keystore ravenloom-release.keystore -alias ravenloom -keyalg RSA -keysize 2048 -validity 10000

# You'll be prompted for:
# - Password (remember this!)
# - Your name/organization
# - Location details
```

**IMPORTANT**: Keep this `.keystore` file safe! You need it for all future updates.

### 5.2 Configure Signing in Android Studio

1. Build → Generate Signed Bundle / APK
2. Choose "Android App Bundle" (AAB) - required for Play Store
3. Select your keystore file
4. Enter keystore password and alias password
5. Choose build variant: `release`
6. Click Finish

Output: `frontend/android/app/release/app-release.aab`

### 5.3 Alternative: Command Line Build

Edit `frontend/android/app/build.gradle`:

```gradle
android {
    signingConfigs {
        release {
            storeFile file("path/to/ravenloom-release.keystore")
            storePassword "your-keystore-password"
            keyAlias "ravenloom"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

Then build:

```bash
cd frontend/android
./gradlew bundleRelease
```

---

## Step 6: Google Play Console Setup

### 6.1 Create Developer Account

1. Go to: https://play.google.com/console
2. Pay $25 one-time registration fee
3. Fill out account details
4. Accept agreements

### 6.2 Create New App

1. Click "Create app"
2. Fill in:
   - **App name**: RavenLoom
   - **Default language**: English (US)
   - **App or game**: App
   - **Free or paid**: Free
3. Accept declarations
4. Click "Create app"

### 6.3 Store Listing

Fill out all required fields:

**App details**:
- Short description (80 chars): "AI-powered project management that adapts to you with personalized Ravens."
- Full description (4000 chars max):

```
RavenLoom is your AI-powered project management companion. Unlike generic task apps, RavenLoom assigns you personalized AI coaches who adapt to your goals and communication style.

🪶 RAVENS - AI Messages That Keep You Accountable
Get timely "Ravens" (push notifications) from your AI coach with:
- Morning check-ins to start your day right
- Quick task reminders you can complete without opening the app
- Strategic questions to keep you on track
- Achievement celebrations when you make progress

✨ PERSONALIZED AI COACHES
Choose from 6 archetypes (Coach, Strategist, Analyst, Maker, Coordinator, Catalyst) with 19 specializations. Your AI adapts its:
- Tone (friendly, direct, professional)
- Verbosity (concise to detailed)
- Communication style to match your preferences

🎯 SMART PROJECT MANAGEMENT
- GTD-enhanced task organization
- Context-based task filtering (@home, @office, @computer, etc.)
- 3-tier AI memory system (remembers your patterns and preferences)
- Privacy-first Ravens (choose what details show in notifications)

PERFECT FOR:
- Personal goals (fitness, learning, habits)
- Professional projects
- Anyone who needs accountability without judgment
- People tired of rigid productivity apps

Privacy levels: Control what shows in notifications
Quiet hours: Set when Ravens won't disturb you
Customizable: Make your AI coach truly yours
```

- **App icon**: 512x512 PNG (upload your icon)
- **Feature graphic**: 1024x500 PNG (create a banner)
- **Screenshots**: At least 2 (phone screenshots: 16:9 ratio)
  - Take screenshots from emulator/device
  - Show: Project list, chat interface, task sidebar

**Categorization**:
- **App category**: Productivity
- **Tags**: Project Management, AI, Productivity, Tasks, Goals

**Contact details**:
- Email: support@ravenloom.ai (or your email)
- Privacy policy URL: (you'll need to create this)

### 6.4 Privacy Policy

Required by Google. Here's a template:

```markdown
# Privacy Policy for RavenLoom

Last updated: [Date]

## Data Collection
RavenLoom collects:
- Account information (email, user ID)
- Project and task data
- AI conversation history
- Push notification preferences

## Data Usage
Your data is used to:
- Provide personalized AI coaching
- Send timely Ravens (push notifications)
- Improve the AI's understanding of your goals

## Data Storage
- All data stored securely on encrypted servers
- We do not sell your data to third parties
- You can delete your account and all data anytime

## Third-Party Services
- Firebase (push notifications)
- OpenAI (AI processing - data not used for training)

## Contact
For privacy questions: privacy@ravenloom.ai
```

Host this on your website or use a service like:
- https://www.freeprivacypolicy.com/
- https://www.termsfeed.com/

### 6.5 Content Rating

1. Complete the content rating questionnaire
2. RavenLoom should get "E for Everyone" or "PEGI 3"
3. Save rating

### 6.6 App Content

1. Select target audience: All ages
2. Declare if you have ads: No
3. COVID-19 contact tracing: No
4. Data safety section:
   - Collects: Email, User ID, App activity
   - Shares: None
   - Encryption: In transit and at rest
   - Can request deletion: Yes

---

## Step 7: Upload & Submit

### 7.1 Production Track

1. Go to "Production" in left menu
2. Click "Create new release"
3. Upload your AAB file (`app-release.aab`)
4. Release name: `1.0.0` (version 1)
5. Release notes:

```
🪶 RavenLoom v1.0 - Initial Release

Welcome to RavenLoom! Your personalized AI project management companion.

Features:
✅ Personalized AI coaches (6 archetypes, 19 specializations)
✅ Ravens - AI push notifications that keep you accountable
✅ GTD-enhanced task management
✅ Privacy-first design with 3 privacy tiers
✅ Context-based task organization
✅ 3-tier AI memory system

Get started by creating your first project and let your AI coach guide you to success!
```

6. Click "Save"
7. Click "Review release"

### 7.2 Final Review

Google will review your app (takes 1-7 days, usually 2-3 days).

They check for:
- Policy compliance
- Content rating accuracy
- Security issues
- Quality standards

### 7.3 After Approval

Once approved:
- App goes live on Play Store
- Share the link: `https://play.google.com/store/apps/details?id=com.ravenloom.app`
- Users can download and install

---

## Step 8: Post-Launch

### 8.1 Monitor Reviews

- Check Play Console daily for user reviews
- Respond to reviews within 24-48 hours
- Address bug reports quickly

### 8.2 Updates

When you want to push updates:

```bash
# 1. Make your code changes
# 2. Update version in frontend/package.json
# 3. Sync Capacitor
npx cap sync

# 4. Build new release AAB
cd android
./gradlew bundleRelease

# 5. Upload to Play Console (Production → Create new release)
```

### 8.3 Analytics

Set up Firebase Analytics to track:
- Active users
- Raven open rates
- Feature usage
- Retention rates

---

## Troubleshooting

### Build Errors

**"SDK not found"**:
- Install Android SDK via Android Studio
- Set ANDROID_SDK_ROOT environment variable

**"Gradle sync failed"**:
- File → Invalidate Caches / Restart in Android Studio
- Delete `android/.gradle` folder and rebuild

### Push Notification Not Working

**Check**:
1. `google-services.json` is in correct location
2. FCM is enabled in Firebase Console
3. App has notification permissions
4. Server key is in backend .env

**Test manually**:
```bash
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "DEVICE_FCM_TOKEN",
    "notification": {
      "title": "🪶 Test Raven",
      "body": "If you see this, push works!"
    }
  }'
```

### App Rejected by Google

Common reasons:
- **Missing privacy policy**: Add one
- **Insufficient screenshots**: Add at least 2
- **Incomplete content rating**: Redo questionnaire
- **Permissions not explained**: Add text explaining why you need notifications

---

## Quick Reference Commands

```bash
# Sync changes to native project
npx cap sync

# Open in Android Studio
npx cap open android

# Build web assets
npm run build

# Copy to native
npx cap copy

# Generate icons
npx capacitor-assets generate

# Build release AAB
cd android && ./gradlew bundleRelease
```

---

## Next Steps

After Play Store launch:

1. **Marketing**: Tweet launch, share on Product Hunt, etc.
2. **Collect Feedback**: Monitor reviews and user behavior
3. **Iterate**: Add features based on user requests
4. **iOS Version**: Repeat similar process for App Store
5. **Monetization**: Consider premium features or subscriptions

---

## Resources

- [Capacitor Docs](https://capacitorjs.com/docs)
- [Firebase Console](https://console.firebase.google.com/)
- [Play Console](https://play.google.com/console)
- [Android Studio](https://developer.android.com/studio)
- [Material Design Icons](https://fonts.google.com/icons)

---

**Questions?** Check the troubleshooting section or create an issue on GitHub.

Good luck with your launch! 🚀🪶
