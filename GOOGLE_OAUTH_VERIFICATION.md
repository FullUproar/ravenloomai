# Google OAuth Verification Guide

## Changes Made for Verification Compliance

### 1. Public Landing Page
✅ Created public homepage visible without login at `ravenloom.ai`
✅ Explains app functionality and purpose
✅ Includes links to Privacy Policy and Terms of Service
✅ Explains how Google user data is used
✅ Meets all Google homepage requirements

### 2. Privacy Policy
✅ Accessible at `https://ravenloom.ai/privacy`
✅ Explains data collection and usage
✅ Linked from landing page footer

### 3. Terms of Service
✅ Accessible at `https://ravenloom.ai/terms`
✅ Full legal terms
✅ Linked from landing page footer

## Domain Ownership Verification

Google requires verification that you own the `ravenloom.ai` domain. Follow these steps:

### Option 1: DNS Verification (Recommended)

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add `ravenloom.ai` as a property
3. Choose "DNS record" verification method
4. Google will provide a TXT record like: `google-site-verification=ABC123xyz`
5. Add this TXT record to your domain's DNS settings (via your domain registrar)
6. Wait for DNS propagation (5-60 minutes)
7. Click "Verify" in Google Search Console

### Option 2: HTML File Upload

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add `ravenloom.ai` as a property
3. Choose "HTML file" verification method
4. Download the verification file (e.g., `google1234567890abcdef.html`)
5. Upload to `frontend/public/google1234567890abcdef.html`
6. Deploy to production
7. Verify the file is accessible at `https://ravenloom.ai/google1234567890abcdef.html`
8. Click "Verify" in Google Search Console

### Option 3: HTML Meta Tag

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Add `ravenloom.ai` as a property
3. Choose "HTML tag" verification method
4. Copy the meta tag provided
5. Add to `frontend/index.html` in the `<head>` section
6. Deploy to production
7. Click "Verify" in Google Search Console

## After Domain Verification

Once your domain is verified in Google Search Console:

1. Go to [Google Cloud Console OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent?project=ravenloom-c964d)
2. Verify that the homepage URL is: `https://ravenloom.ai`
3. Verify that the privacy policy URL is: `https://ravenloom.ai/privacy`
4. Click **Prepare for verification** at the bottom
5. Review all information
6. Click **Submit for verification**

## Verification Checklist

Before submitting to Google, verify:

- [ ] `ravenloom.ai` loads without errors
- [ ] Landing page is visible without login
- [ ] Landing page explains app functionality
- [ ] Landing page explains Google data usage
- [ ] Privacy Policy link works (`/privacy`)
- [ ] Terms of Service link works (`/terms`)
- [ ] Domain ownership is verified in Google Search Console
- [ ] No redirects (homepage URL matches browser URL)
- [ ] All links use `https://ravenloom.ai` (not shortened URLs)

## Common Issues

### "Homepage is behind a login"
❌ **Before**: Homepage showed login screen immediately
✅ **After**: Landing page visible to all visitors, login only after clicking "Get Started"

### "Homepage does not include link to privacy policy"
❌ **Before**: No visible links on login screen
✅ **After**: Footer on landing page includes Privacy and Terms links

### "Domain not verified"
❌ **Before**: No verification
✅ **After**: Follow steps above to verify ownership

### "Homepage does not explain data usage"
❌ **Before**: No explanation
✅ **After**: "How We Use Your Google Data" section on landing page

## Files Changed

- `frontend/src/LandingPage.jsx` - New public homepage component
- `frontend/src/App.jsx` - Updated to show landing page first
- `frontend/public/privacy.html` - Privacy policy (already exists)
- `frontend/public/terms.html` - Terms of service (already exists)

## Testing

Test the landing page locally:
1. Open browser in incognito mode
2. Go to `http://localhost:5173`
3. Verify landing page loads (not login screen)
4. Click privacy/terms links
5. Click "Get Started" to see login

Test on production:
1. Go to `https://ravenloom.ai`
2. Verify landing page loads
3. Test all links
4. Verify no login required to view page

## Next Steps

1. ✅ Deploy changes to production
2. ⏳ Verify domain ownership in Google Search Console
3. ⏳ Submit for Google OAuth verification
4. ⏳ Wait for Google review (1-2 weeks typically)

## Contact

For questions about this setup, refer to:
- [Google OAuth Verification Documentation](https://support.google.com/cloud/answer/9110914)
- [Google Search Console Help](https://support.google.com/webmasters)
