# Firebase Authorized Domains Fix

## Problem
Google Sign-In is failing because `localhost:5173` is not authorized in Firebase Console.
Firebase doesn't accept port numbers in authorized domains.

## Solution

### Step 1: Add `localhost` to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/project/ravenloom-c964d/authentication/settings)
2. Click on the "Settings" tab
3. Scroll to "Authorized domains"
4. Click "Add domain"
5. Enter: `localhost` (just "localhost", no port)
6. Click "Add"

### Step 2: Verify Current Domains

Your authorized domains should include:
- `localhost` (for local development)
- `ravenloom-c964d.firebaseapp.com` (Firebase hosting)
- `10.0.2.2` (Android emulator - already added)
- Any production domains you're using

### Why This Works

Firebase Auth uses the **domain** (not the full URL with port) to verify redirect origins.
When you add `localhost`, it will accept redirects from:
- `http://localhost:5173`
- `http://localhost:3000`
- `http://localhost` (any port)

### Current Status

✅ Mobile (Android): Working - `10.0.2.2` is authorized
❌ Web (localhost): Not working - need to add `localhost`

### After Adding `localhost`

Once you add `localhost` to Firebase authorized domains:
1. No code changes needed
2. Google Sign-In with redirect will work immediately
3. Both web and mobile will use the same redirect flow

### Testing After Fix

1. Clear your browser cache/localStorage (or use incognito mode)
2. Go to `http://localhost:5173`
3. Click "Continue with Google"
4. Select your Google account
5. You should be redirected back and signed in successfully

---

**Note**: If you want to use popup-based auth instead of redirect (better UX for web), you'll need to switch back once `localhost` is authorized. But redirect auth works fine for both web and mobile.
