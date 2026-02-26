/**
 * Landing Page Module
 *
 * Contains assets and utilities for the deep link landing page (app.chatic.io)
 *
 * Files:
 * - index.html: Landing page HTML (deploy to app.chatic.io)
 * - deferred.ts: Deferred deep link utilities for web
 *
 * Usage:
 * 1. Deploy index.html to https://app.chatic.io/
 * 2. Update Firebase config in index.html
 * 3. The page will handle:
 *    - Device detection (iOS/Android/Desktop)
 *    - App launch attempt via custom scheme
 *    - Deferred deep link storage (Firestore)
 *    - Store redirect fallback
 */
