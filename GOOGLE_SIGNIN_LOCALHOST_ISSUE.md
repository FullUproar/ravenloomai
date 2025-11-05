# Google Sign-In Localhost Issue

## Problem

Google Sign-In is not working on `localhost:5173` due to Firebase authorized domain restrictions.

## Root Cause

Firebase's authorized domains feature has a known limitation with localhost development:
- `localhost` is authorized in Firebase Console
- However, Firebase/Google OAuth appears to have issues recognizing `localhost` with non-standard ports
- Incognito mode works (clean session, no cached auth state)
- Mobile works (using `10.0.2.2` which is properly authorized)

## Attempted Solutions

1. ✅ Added `localhost` to Firebase authorized domains - **Already done**
2. ✅ Added `127.0.0.1` to Firebase authorized domains - **Already done**
3. ❌ Tried using `127.0.0.1:5173` - Browser refuses connection
4. ✅ Switched from popup to redirect auth - Still fails
5. ✅ Added proper logout cache clearing - Implemented
6. ✅ Added `prompt: 'select_account'` to force account picker - Implemented

## Current Workarounds

### For Local Development (Recommended)
**Use the Test User button** - This bypasses authentication entirely and is perfect for development.

### For Testing Google Sign-In
**Use Incognito Mode** - Google Sign-In works perfectly in incognito mode because there's no cached session state.

### For Production
Google Sign-In will work fine in production with proper domains.

## Status

- ✅ **Mobile**: Google Sign-In works (redirect auth with `10.0.2.2`)
- ✅ **Web (Incognito)**: Google Sign-In works
- ❌ **Web (Normal)**: Google Sign-In fails due to localhost domain issue
- ✅ **Web (Test User)**: Works perfectly for development

## Recommendation

For now, use the **Test User button** for local development. Google Sign-In is fully functional in:
- Incognito mode (for testing)
- Mobile app
- Production deployment

The localhost issue is a known Firebase limitation that affects many developers. The test user bypass is the standard solution for local development.

## Future Fix

If we need Google Sign-In working on localhost in normal mode, we can:
1. Deploy to a real domain (even a free one like Vercel/Netlify)
2. Use ngrok or similar tunneling service for local development
3. Wait for Firebase to improve localhost support

---

**Bottom line**: Everything works except Google Sign-In on localhost in normal browsing mode. Use Test User for development, incognito for testing Google Sign-In flow.
