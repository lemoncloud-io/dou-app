/**
 * Deferred Deep Linking
 *
 * Handles deferred deep links (first install attribution)
 *
 * Priority:
 * 1. Firestore (IP fingerprint matching) - iOS & Android
 * 2. Play Install Referrer API - Android only
 * 3. Local AsyncStorage (fallback)
 */

import { Platform } from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { retrieveDeferredLinkFromFirestore } from './firestoreDeferred';

import type { DeferredLinkData } from './types';

import { ONE_HOUR_MS } from './constants';

const DEFERRED_LINK_KEY = '@chatic:deferredLink';
const DEFERRED_LINK_PROCESSED_KEY = '@chatic:deferredLinkProcessed';
const MAX_AGE_MS = ONE_HOUR_MS;

/**
 * Store deferred deep link for later processing
 */
export const storeDeferredLink = async (url: string): Promise<void> => {
    try {
        const data: DeferredLinkData = {
            url,
            timestamp: Date.now(),
        };
        await AsyncStorage.setItem(DEFERRED_LINK_KEY, JSON.stringify(data));
    } catch (error) {
        console.error('[DeferredDeepLink] Error storing deferred link:', error);
    }
};

/**
 * Get and clear deferred deep link
 */
export const getDeferredLink = async (): Promise<string | null> => {
    try {
        const dataStr = await AsyncStorage.getItem(DEFERRED_LINK_KEY);
        if (!dataStr) {
            return null;
        }

        const data: DeferredLinkData = JSON.parse(dataStr);
        const age = Date.now() - data.timestamp;

        // Check if expired
        if (age > MAX_AGE_MS) {
            await clearDeferredLink();
            console.log('[DeferredDeepLink] Deferred link expired');
            return null;
        }

        // Clear after retrieval
        await clearDeferredLink();
        return data.url;
    } catch (error) {
        console.error('[DeferredDeepLink] Error getting deferred link:', error);
        return null;
    }
};

/**
 * Clear deferred deep link data
 */
export const clearDeferredLink = async (): Promise<void> => {
    try {
        await AsyncStorage.removeItem(DEFERRED_LINK_KEY);
    } catch (error) {
        console.error('[DeferredDeepLink] Error clearing deferred link:', error);
    }
};

/**
 * Check if deferred link has already been processed
 */
export const isDeferredLinkProcessed = async (): Promise<boolean> => {
    try {
        const processed = await AsyncStorage.getItem(DEFERRED_LINK_PROCESSED_KEY);
        return processed === 'true';
    } catch {
        return false;
    }
};

/**
 * Mark deferred link as processed (first launch complete)
 */
export const markDeferredLinkProcessed = async (): Promise<void> => {
    try {
        await AsyncStorage.setItem(DEFERRED_LINK_PROCESSED_KEY, 'true');
    } catch (error) {
        console.error('[DeferredDeepLink] Error marking deferred link processed:', error);
    }
};

/**
 * Get install referrer data (Android only)
 * Uses Play Install Referrer API
 */
export const getInstallReferrer = async (): Promise<string | null> => {
    if (Platform.OS !== 'android') {
        return null;
    }

    try {
        // Dynamic import to avoid iOS build issues
        const PlayInstallReferrer = await import('react-native-play-install-referrer').then(m => m.default);

        if (!PlayInstallReferrer?.getReferrerDetails) {
            console.log('[DeferredDeepLink] PlayInstallReferrer not available');
            return null;
        }

        const referrerDetails = await PlayInstallReferrer.getReferrerDetails();

        if (referrerDetails?.installReferrer) {
            console.log('[DeferredDeepLink] Install referrer:', referrerDetails.installReferrer);

            // Parse referrer URL to extract deep link
            // Example: utm_source=google&deep_link_value=https://app.chatic.io/chat/123
            const params = new URLSearchParams(referrerDetails.installReferrer);
            const deepLink = params.get('deep_link_value') || params.get('link');

            if (deepLink) {
                return decodeURIComponent(deepLink);
            }
        }

        return null;
    } catch (error) {
        console.error('[DeferredDeepLink] Error getting install referrer:', error);
        return null;
    }
};

/**
 * Get deferred deep link from clipboard (iOS)
 * Note: iOS 14+ shows a paste permission toast to the user
 */
export const getClipboardDeepLink = async (): Promise<string | null> => {
    if (Platform.OS !== 'ios') {
        return null;
    }

    try {
        // Dynamic import Clipboard
        const Clipboard = await import('@react-native-clipboard/clipboard').then(m => m.default).catch(() => null);

        if (!Clipboard) {
            console.log('[DeferredDeepLink] Clipboard module not available');
            return null;
        }

        const clipboardContent = await Clipboard.getString();

        if (!clipboardContent) {
            return null;
        }

        // Check if clipboard contains a valid deep link URL
        const deepLinkPattern = /^https:\/\/app\.chatic\.io\/.+/;
        if (deepLinkPattern.test(clipboardContent)) {
            console.log('[DeferredDeepLink] Found deep link in clipboard');
            // Clear clipboard after reading (privacy)
            await Clipboard.setString('');
            return clipboardContent;
        }

        return null;
    } catch (error) {
        console.error('[DeferredDeepLink] Error reading clipboard:', error);
        return null;
    }
};

/**
 * Main deferred deep link handler
 * Checks multiple sources for deferred deep links
 *
 * Strategy:
 * 1. Local AsyncStorage (manually stored) - checked first
 * 2. Firestore + Install Referrer (Android) - checked in PARALLEL for better hit rate
 *    - First successful result wins
 */
export const handleDeferredDeepLink = async (): Promise<string | null> => {
    // Check if already processed
    const processed = await isDeferredLinkProcessed();
    if (processed) {
        return null;
    }

    // 1. Check stored deferred link first (local)
    const storedLink = await getDeferredLink();
    if (storedLink) {
        console.log('[DeferredDeepLink] Found local stored link');
        await markDeferredLinkProcessed();
        return storedLink;
    }

    // 2. Check Firestore and Install Referrer in PARALLEL (Android)
    //    This increases hit rate as recommended by architecture
    const promises: Promise<string | null>[] = [
        // Firestore lookup (works on both iOS & Android)
        retrieveDeferredLinkFromFirestore().catch(error => {
            console.error('[DeferredDeepLink] Firestore lookup failed:', error);
            return null;
        }),
    ];

    // Add Install Referrer for Android (parallel)
    if (Platform.OS === 'android') {
        promises.push(
            getInstallReferrer().catch(error => {
                console.error('[DeferredDeepLink] Install Referrer failed:', error);
                return null;
            })
        );
    }

    // Race for first successful result, but wait for all to complete for cleanup
    const results = await Promise.all(promises);
    const link = results.find(result => result !== null) || null;

    if (link) {
        const source = results[0] === link ? 'Firestore' : 'Install Referrer';
        console.log(`[DeferredDeepLink] Found link from ${source}:`, link);
    }

    // Mark as processed even if no link found
    await markDeferredLinkProcessed();
    return link;
};
