/**
 * Web Deferred Deep Link - Landing Page Implementation
 *
 * Copy this code to your web landing page to enable deferred deep linking.
 * When a user clicks a deep link on web but doesn't have the app installed,
 * this stores the link in Firestore so the app can retrieve it after installation.
 *
 * Requirements:
 * - Firebase JS SDK initialized
 * - Firestore enabled in Firebase Console
 *
 * Usage:
 * 1. User visits: https://app.chatic.io/chat/123
 * 2. Web detects app not installed
 * 3. Calls storeDeferredDeepLink('https://app.chatic.io/chat/123')
 * 4. Redirects to App Store / Play Store
 * 5. User installs app, opens it
 * 6. App retrieves the stored deep link via fingerprint matching
 */

import { addDoc, collection, getFirestore, serverTimestamp, Timestamp } from 'firebase/firestore';

import { DEFERRED_LINKS_COLLECTION, hashFingerprintComponents, LINK_TTL_HOURS } from '../lib/constants';

/** Timeout before assuming app is not installed (ms) */
const APP_LAUNCH_TIMEOUT_MS = 1500;

/** Grace period to confirm app didn't open (ms) */
const APP_LAUNCH_GRACE_PERIOD_MS = 2000;

/**
 * Generate fingerprint from browser/device characteristics
 * MUST match the mobile app's fingerprint generation algorithm
 *
 * Components: IP + timezone + locale (platform NOT included for cross-platform matching)
 */
const generateFingerprint = async (): Promise<string> => {
    // Get public IP
    let ip = 'unknown';
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        ip = data.ip || 'unknown';
    } catch (error) {
        console.error('Failed to get IP:', error);
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Use language code only (e.g., "ko" not "ko-KR") to match native app
    const locale = (navigator.language || 'unknown').split('-')[0];

    // Hash the components using shared algorithm
    // Platform is intentionally NOT included to allow web-to-app matching
    const str = `${ip}|${timezone}|${locale}`;
    return hashFingerprintComponents(str);
};

/**
 * Store deferred deep link to Firestore
 * Call this when user clicks a deep link but app is not installed
 *
 * @param deepLinkUrl - The deep link URL (e.g., https://app.chatic.io/chat/123)
 */
export const storeDeferredDeepLink = async (deepLinkUrl: string): Promise<void> => {
    try {
        const db = getFirestore();
        const fingerprint = await generateFingerprint();
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000));

        await addDoc(collection(db, DEFERRED_LINKS_COLLECTION), {
            fingerprint,
            deepLinkUrl,
            createdAt: serverTimestamp(),
            expiresAt,
        });

        console.log('[DeferredDeepLink] Stored:', { fingerprint, deepLinkUrl });
    } catch (error) {
        console.error('[DeferredDeepLink] Failed to store:', error);
    }
};

/**
 * Detect if the user is on mobile
 */
export const isMobile = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Detect platform
 */
export const getPlatform = (): 'ios' | 'android' | 'other' => {
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return 'other';
};

/**
 * Get App Store / Play Store URL
 */
export const getStoreUrl = (isDev = false): string => {
    const platform = getPlatform();
    if (platform === 'ios') {
        // App Store URLs
        return isDev
            ? 'https://apps.apple.com/app/id6758756090' // io.chatic.dou.dev
            : 'https://apps.apple.com/app/id6758658673'; // io.chatic.dou
    }
    if (platform === 'android') {
        // Play Store URLs
        return isDev
            ? 'https://play.google.com/store/apps/details?id=io.chatic.dou.dev'
            : 'https://play.google.com/store/apps/details?id=io.chatic.dou';
    }
    return '';
};

/**
 * Full flow: Try to open app, if not installed store deferred link and redirect to store
 *
 * @param deepLinkUrl - The deep link URL
 */
export const handleDeepLinkClick = async (deepLinkUrl: string): Promise<void> => {
    if (!isMobile()) {
        // Desktop: show QR code or instructions
        console.log('Please open this link on your mobile device');
        return;
    }

    const customSchemeUrl = deepLinkUrl.replace('https://app.chatic.io', 'chatic://');

    // Try to open the app
    const startTime = Date.now();
    window.location.href = customSchemeUrl;

    // Wait to see if app opened
    setTimeout(async () => {
        // If we're still here after timeout, app probably isn't installed
        if (Date.now() - startTime < APP_LAUNCH_GRACE_PERIOD_MS) {
            // Store deferred link
            await storeDeferredDeepLink(deepLinkUrl);

            // Redirect to store
            window.location.href = getStoreUrl();
        }
    }, APP_LAUNCH_TIMEOUT_MS);
};

// Example usage in landing page:
// <script>
//   import { handleDeepLinkClick } from './web-deferred-deeplink';
//
//   // When page loads with deep link path
//   const deepLinkUrl = window.location.href; // e.g., https://app.chatic.io/chat/123
//   handleDeepLinkClick(deepLinkUrl);
// </script>
