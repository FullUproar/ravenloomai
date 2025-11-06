# Google Sign-In Status & Issues

**Last Updated:** November 5, 2025

## Current Status

- ✅ **Localhost (incognito)**: Should work with latest code (popup auth)
- ❌ **Production (ravenloom.ai)**: Not working - old code still deployed
- ✅ **Mobile**: Working (redirect auth with 10.0.2.2)

## Root Cause Analysis

### Issue 1: Vercel Deployments Not Auto-Triggering
- Recent commits (popup auth fix, legal docs) haven't deployed automatically
- GitHub/Vercel webhook may be disconnected
- Last successful deployment: 6 days ago

### Issue 2: WWW Subdomain
- User accesses `www.ravenloom.ai` but most testing was for `ravenloom.ai`
- Both domains need to be configured identically

### Issue 3: Redirect Auth vs Popup Auth
- Originally used redirect auth (doesn't work reliably with custom domains)
- Switched to popup auth (commit 9132a19) but not yet deployed to production

## Firebase Console Configuration

### Authorized Domains (Already Done ✅)
In Firebase Console → Authentication → Settings → Authorized domains:
- ✅ `localhost`
- ✅ `127.0.0.1`
- ✅ `10.0.2.2` (Android emulator)
- ✅ `ravenloom.ai`
- ✅ `www.ravenloom.ai`
- ✅ `ravenloom-c964d.firebaseapp.com`

### Google Cloud Console OAuth (Needs Update)
In Google Cloud Console → APIs & Services → OAuth consent screen:
- [ ] **Application name**: "RavenLoom" (or "RavenLoom AI")
- [ ] **Application logo**: Upload RavenLoom logo
- [ ] **Support email**: support@ravenloom.ai
- [ ] **Privacy Policy**: https://ravenloom.ai/privacy.html
- [ ] **Terms of Service**: https://ravenloom.ai/terms.html
- [ ] **Authorized domains**: Add `ravenloom.ai` (and `www.ravenloom.ai` if required)

## Code Changes Made (Not Yet in Production)

### Commit: 9132a19 - Switch to popup auth for web
- **File**: `frontend/src/Login.jsx`
- **Change**: Use `signInWithPopup` for web, `signInWithRedirect` for mobile only
- **Why**: Popup auth doesn't have cross-domain redirect issues

### Commit: f693b71 - Enhanced error logging
- **File**: `frontend/src/Login.jsx`
- **Change**: Added detailed console logging to diagnose auth failures
- **Why**: Better visibility into what's failing

### Commit: ceba606 - Legal documents
- **Files**: `frontend/public/privacy.html`, `frontend/public/terms.html`
- **Why**: Required for OAuth consent screen

## Immediate Actions Required

### 1. Deploy Latest Code to Production
**Option A: Manual Redeploy via Vercel Dashboard**
- Go to https://vercel.com/
- Find project: `ravenloom-ai-site`
- Click "Redeploy" on latest deployment
- Or trigger new deployment from GitHub

**Option B: Fix GitHub/Vercel Integration**
- Check Vercel project settings
- Verify GitHub webhook is connected
- Test by making a trivial commit

### 2. Test on Localhost First
1. Go to http://localhost:5173 in incognito mode
2. Click "Continue with Google"
3. Verify popup auth works
4. If it works locally, we know the code fix is correct

### 3. Configure OAuth Consent Screen
- Update application name, logo, links in Google Cloud Console
- This makes the OAuth screen look professional

## Technical Details

### Why Popup Auth Works Better
- **Redirect auth**: Navigates whole page to Firebase domain, then back
  - Problem: Cross-domain redirect issues with custom domains
  - Problem: Page state is lost during redirect

- **Popup auth**: Opens OAuth in a popup window
  - Benefit: Main page stays on your domain
  - Benefit: Firebase handles OAuth in popup, returns credentials
  - Benefit: Works reliably across all domains

### Firebase Auth Flow (Popup)
1. User clicks "Continue with Google" on `www.ravenloom.ai`
2. `signInWithPopup()` opens new window to `ravenloom-c964d.firebaseapp.com`
3. Firebase redirects to Google OAuth
4. User selects account and grants permission
5. Google redirects back to `ravenloom-c964d.firebaseapp.com/__/auth/handler`
6. Firebase processes auth and closes popup
7. Main page receives auth credentials
8. `onAuthStateChanged` fires and app loads

## Testing Checklist

### Localhost Testing
- [ ] Clear browser cache / use incognito
- [ ] Go to http://localhost:5173
- [ ] Click "Continue with Google"
- [ ] Verify popup opens
- [ ] Select Google account
- [ ] Verify popup closes
- [ ] Verify user is signed in
- [ ] Check console for success logs

### Production Testing (After Deploy)
- [ ] Clear browser cache / use incognito
- [ ] Go to https://ravenloom.ai
- [ ] Repeat above steps
- [ ] Test on https://www.ravenloom.ai too

### Mobile Testing
- [ ] Test on Android app
- [ ] Redirect auth should still work
- [ ] Verify user is signed in after returning from Google

## Rollback Plan (If Popup Auth Fails)

If popup auth doesn't work, we can:

1. **Set up Firebase Hosting custom domain**
   - Configure Firebase Hosting to use ravenloom.ai
   - This makes redirect auth work properly with custom domains

2. **Use redirect auth everywhere**
   - Revert to redirect auth for all platforms
   - Requires Firebase Hosting custom domain setup

3. **Accept localhost limitation**
   - Use Test User button for local development
   - Use production for testing Google Sign-In

## References

- Firebase Console: https://console.firebase.google.com/project/ravenloom-c964d
- Google Cloud Console: https://console.cloud.google.com/
- Vercel Dashboard: https://vercel.com/
- GitHub Repo: https://github.com/FullUproar/ravenloomai

## Contact

For questions or issues, contact the development team or refer to Firebase documentation:
https://firebase.google.com/docs/auth/web/google-signin
