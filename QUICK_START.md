# RavenLoom Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites Check
```bash
node --version    # Should be 18+
npm --version     # Should be 9+
java --version    # Should be 17+ (for Android)
```

---

## 🏃 Quick Development Setup

### 1. Start Backend (Terminal 1)
```bash
cd backend
npm install
node index.js
```

**Expected output:**
```
🔥 Firebase initialized
📊 Database connected
🚀 Server running on http://localhost:4000
🌐 GraphQL playground: http://localhost:4000/graphql
```

### 2. Start Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```

**Access:** http://localhost:5173

### 3. View Storybook (Optional - Terminal 3)
```bash
cd frontend
npm run storybook
```

**Access:** http://localhost:6006

---

## 📱 Build Android App

### Quick Build (Debug APK)
```bash
cd frontend
npm run build              # Build web app
npx cap sync android       # Sync to Android
cd android
./gradlew assembleDebug    # Build APK
```

**Output:** `android/app/build/outputs/apk/debug/app-debug.apk`

### Install on Device
```bash
adb install -r app-debug.apk
```

---

## 🎨 View Component Library

**Storybook is already running!**
Open: http://localhost:6006

### Available Components:
- **PersonaAvatar** - Display persona avatars (4 sizes, 2 shapes, 32 colors)
- **PersonaColorPicker** - Choose colors and shapes
- **PersonaNameSelector** - Pick unique names with typeahead
- **TaskCard** - Display tasks in various states

---

## 🧪 Test GraphQL API

Open: http://localhost:4000/graphql

### Query: Get Available Names
```graphql
query {
  getAvailableNames(archetype: "coach") {
    id
    name
    popularityRank
    isAvailable
  }
}
```

### Mutation: Claim a Name
```graphql
mutation {
  claimPersonaName(
    userId: "test-user-123"
    name: "Sarah"
    archetype: "coach"
    color: "#DC2626"
    shape: "circle"
  ) {
    id
    name
    archetype
    claimedAt
  }
}
```

---

## 📂 Key Files You'll Edit

### Add/Remove Names
**File:** `backend/scripts/load-baby-names-simple.js`
```javascript
const NAMES = [
  'Alex', 'Jordan', 'Taylor', // ... add more here
];
```
**Run:** `cd backend && node scripts/load-baby-names-simple.js`

### Change Colors
**File:** `frontend/src/PersonaColorPicker.jsx`
```javascript
const COLOR_PALETTE = {
  warm: [
    { name: 'Crimson', hex: '#DC2626' },
    // Add new colors here
  ],
};
```

### Modify Archetypes
**File:** `frontend/src/PersonaCreatorIntegrated.jsx`
```javascript
const ARCHETYPES = {
  coach: {
    name: 'Coach',
    emoji: '🏃',
    description: 'Motivates and guides you',
    specializations: ['Health', 'Fitness', ...]
  },
  // Add new archetypes here
};
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
cd backend
rm -rf node_modules
npm install
node index.js
```

### Frontend build fails
```bash
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

### Android build fails
```bash
cd frontend/android
./gradlew clean
./gradlew assembleDebug --stacktrace
```

### Database issues
```bash
cd backend
# Re-run migrations
node run-migration-006-user-profiles.js
node run-migration-008.js
# Re-load names
node scripts/load-baby-names-simple.js
```

---

## 📖 Full Documentation

- **[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)** - Complete feature overview
- **[ANDROID_BUILD_GUIDE.md](ANDROID_BUILD_GUIDE.md)** - Detailed Android instructions
- **Storybook** - Component documentation at http://localhost:6006

---

## ✅ Checklist for First Run

- [ ] Backend starts without errors
- [ ] Frontend loads at http://localhost:5173
- [ ] Can view GraphQL playground at http://localhost:4000/graphql
- [ ] Storybook shows components at http://localhost:6006
- [ ] Database has baby names loaded (query `SELECT COUNT(*) FROM available_names;`)
- [ ] Android project builds (if testing mobile)

---

## 🎯 What to Do Next

1. **Try the App**
   - Create a project
   - Test persona creation flow (currently uses AI-generated)
   - Chat with your persona

2. **Integrate New UI**
   - Replace `CreateProjectForm` in `App.jsx` with `PersonaCreatorIntegrated`
   - Use `PersonaAvatar` component in project cards
   - Test the new 3-step creation wizard

3. **Test on Mobile**
   - Build Android APK
   - Install on emulator or device
   - Test full flow on mobile

4. **Deploy to Production**
   - Deploy backend to Render/Railway/Vercel
   - Update frontend API URL
   - Build signed Android release

---

## 💡 Quick Tips

- **Hot Reload**: Changes to React components auto-refresh
- **Database Reset**: Run migrations again to reset schema
- **Name Conflicts**: Each name is unique per archetype only
- **Storybook**: Best way to develop UI components in isolation
- **Mobile Dev**: Use `url: 'http://10.0.2.2:5173'` in capacitor.config.ts for hot reload

---

## 🆘 Need Help?

Check the error message and:
1. Search in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
2. Look in [ANDROID_BUILD_GUIDE.md](ANDROID_BUILD_GUIDE.md) for mobile issues
3. Check browser console (F12) for frontend errors
4. Check terminal output for backend errors
5. Use `adb logcat` for Android errors

---

**Ready to build something amazing! 🚀**
