# Deep Linking Setup Guide

## Overview

This document describes the deep linking configuration for the Chatic mobile app.

## Domain Configuration

| Purpose            | Domain          |
| ------------------ | --------------- |
| Deep Link          | `app.chatic.io` |
| Frontend (WebView) | `dou.chatic.io` |
| Custom Scheme      | `chatic://`     |

## URL Flow

```
Deep Link URL                    →  Frontend URL (WebView)
─────────────────────────────────────────────────────────────
https://app.chatic.io/chat/123   →  https://dou.chatic.io/chat/123
chatic://chat/123                →  https://dou.chatic.io/chat/123
```

## iOS Configuration

### Bundle IDs

- Production: `io.chatic.dou`
- Development: `io.chatic.dou.dev`

### Team ID

`REDACTED_TEAM_ID`

### Associated Domains (Xcode)

Add the following to your app's Associated Domains capability:

```
applinks:app.chatic.io
```

### Apple App Site Association (AASA)

The AASA file must be hosted at:

```
https://app.chatic.io/.well-known/apple-app-site-association
```

Content-Type: `application/json` (no file extension)

See: `docs/deep-linking-assets/.well-known/apple-app-site-association`

### Validation

Use Apple's AASA validator:
https://branch.io/resources/aasa-validator/

## Android Configuration

### Package Names

- Production: `io.chatic.dou`
- Development: `io.chatic.dou.dev`

### SHA256 Fingerprints

Generate your keystore fingerprints:

```bash
# Debug keystore
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

# Release keystore
keytool -list -v -keystore your-release.keystore -alias your-alias
```

Update the fingerprints in:
`docs/deep-linking-assets/.well-known/assetlinks.json`

### Digital Asset Links

The assetlinks.json file must be hosted at:

```
https://app.chatic.io/.well-known/assetlinks.json
```

### Validation

Use Google's Asset Links tool:
https://developers.google.com/digital-asset-links/tools/generator

## Server Deployment

### S3 + CloudFront Setup

1. Create S3 bucket for `app.chatic.io`
2. Upload `.well-known` folder contents
3. Configure CloudFront distribution with SSL certificate
4. Set CORS and Content-Type headers:
    - `apple-app-site-association`: `application/json`
    - `assetlinks.json`: `application/json`

### Important Notes

- Apple CDN caches AASA files for up to 48 hours
- Test with real devices, not simulators, for final validation
- Both files must be served over HTTPS

## Testing

### iOS Simulator

```bash
xcrun simctl openurl booted "https://app.chatic.io/chat/123"
xcrun simctl openurl booted "chatic://chat/123"
```

### Android ADB

```bash
# App Links
adb shell am start -W -a android.intent.action.VIEW \
  -d "https://app.chatic.io/chat/123" io.chatic.dou

# Custom scheme
adb shell am start -W -a android.intent.action.VIEW \
  -d "chatic://chat/123" io.chatic.dou

# Check App Links status
adb shell dumpsys package domain-preferred-apps | grep io.chatic.dou
```

## Deferred Deep Links

Deferred deep links allow users to be directed to specific content after installing the app for the first time.

### How It Works

```
1. User clicks deep link on web (https://app.chatic.io/chat/123)
2. Web detects app not installed
3. Web stores fingerprint + deep link URL in Firestore
4. User redirected to App Store / Play Store
5. User installs and opens app
6. App generates same fingerprint, queries Firestore
7. App retrieves deep link URL and navigates to content
```

### Implementation

**Priority order for deferred link retrieval:**

1. Firestore (IP fingerprint matching) - iOS & Android
2. Play Install Referrer API - Android only
3. Local AsyncStorage (fallback)

### Fingerprint Components

```typescript
{
    ip: string,        // Public IP (from ipify.org)
    timezone: string,  // e.g., "Asia/Seoul"
    locale: string,    // e.g., "ko-KR"
    platform: 'ios' | 'android'
}
```

### Accuracy

- Same WiFi network: ~80%
- Same mobile carrier: ~70%
- Different network/VPN: Low

### Firebase Setup

1. **Enable Firestore** in Firebase Console
2. **Deploy Security Rules**: `docs/deep-linking-assets/firestore.rules`
3. **Create Index**: `docs/deep-linking-assets/firestore.indexes.json`
4. **Add Web Code**: Use `docs/deep-linking-assets/web-deferred-deeplink.ts` in landing page

### Firestore Collection Structure

```
deferredDeepLinks/
  {documentId}/
    fingerprint: string
    deepLinkUrl: string
    createdAt: Timestamp
    expiresAt: Timestamp (24 hours from creation)
```

## Troubleshooting

### iOS Universal Links not working

1. Check AASA file is accessible: `curl -I https://app.chatic.io/.well-known/apple-app-site-association`
2. Verify Content-Type is `application/json`
3. Validate Team ID and Bundle ID match
4. Wait 48 hours for Apple CDN cache to update
5. Delete and reinstall the app to refresh AASA

### Android App Links not working

1. Check assetlinks.json is accessible: `curl https://app.chatic.io/.well-known/assetlinks.json`
2. Verify SHA256 fingerprints match your signing key
3. Ensure `android:autoVerify="true"` is set in AndroidManifest.xml
4. Check verification status: `adb shell pm get-app-links io.chatic.dou`
