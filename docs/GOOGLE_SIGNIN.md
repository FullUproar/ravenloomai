# Google Sign-In Setup

Complete guide for setting up Google Sign-In with Firebase Authentication.

## Firebase Console Setup

### Authorized Domains

In [Firebase Console](https://console.firebase.google.com/project/ravenloom-c964d/authentication/settings) → Authentication → Settings → Authorized domains, add:

- `localhost` (development)
- `ravenloom.ai` (production)
- `www.ravenloom.ai` (production subdomain)
- `10.0.2.2` (Android emulator)
- `ravenloom-c964d.firebaseapp.com` (Firebase hosting)

## Authentication Methods

### Web (Popup Auth)
We use popup-based auth for web - it's more reliable than redirect auth across custom domains.

```javascript
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

const provider = new GoogleAuthProvider();
const result = await signInWithPopup(auth, provider);
```

### Mobile (Redirect Auth)
Mobile uses redirect auth which works well with native webviews:

```javascript
import { signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';

const provider = new GoogleAuthProvider();
await signInWithRedirect(auth, provider);
```

## Development

### Local Testing
- Use the **Test User button** for fast local development (bypasses auth entirely)
- For testing actual Google Sign-In, use **incognito mode** (avoids cached session issues)

### Common Issues

**"Sign-in failed. The redirect to Google may have been blocked."**
- Add `localhost` to Firebase authorized domains
- Clear browser cache or use incognito mode

**Localhost with port numbers**
- Firebase authorizes `localhost` (no port needed)
- This covers `localhost:5173`, `localhost:3000`, etc.

## Production Deployment

### OAuth Consent Screen
In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → OAuth consent screen:

1. Set application name: "RavenLoom"
2. Add support email
3. Set homepage: `https://ravenloom.ai`
4. Set privacy policy: `https://ravenloom.ai/privacy.html`
5. Set terms of service: `https://ravenloom.ai/terms.html`
6. Add authorized domains: `ravenloom.ai`

### Domain Verification
Google requires domain ownership verification:

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add `ravenloom.ai` as property
3. Choose DNS or HTML file verification
4. Complete verification before submitting for OAuth review

## Status Summary

| Platform | Status | Method |
|----------|--------|--------|
| Production (ravenloom.ai) | Working | Popup auth |
| Localhost (incognito) | Working | Popup auth |
| Localhost (normal) | Use Test User | Popup auth |
| Android app | Working | Redirect auth |
| Android emulator | Working | Redirect auth (10.0.2.2) |

## References

- [Firebase Auth Web Setup](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase Console](https://console.firebase.google.com/project/ravenloom-c964d)
- [Google Cloud Console](https://console.cloud.google.com/)
