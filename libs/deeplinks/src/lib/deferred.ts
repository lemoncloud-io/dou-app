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

        const parsed: unknown = JSON.parse(dataStr);

        // Runtime validation of parsed data
        if (!parsed || typeof parsed !== 'object' || !('url' in parsed) || !('timestamp' in parsed)) {
            console.error('[DeferredDeepLink] Invalid stored data format');
            await clearDeferredLink();
            return null;
        }

        const data = parsed as DeferredLinkData;
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
        const PlayInstallReferrer = (await import('react-native-play-install-referrer').then(m => m.default)) as any;

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
 * Main deferred deep link handler
 * Checks multiple sources for deferred deep links
 *
 * Strategy:
 * 1. Local AsyncStorage (manually stored) - checked first
 * 2. Firestore + Install Referrer (Android) - checked in PARALLEL for better hit rate
 *    - First successful result wins
 */
export const handleDeferredDeepLink = async (): Promise<string | null> => {
    // Deferred deep links are no longer supported as Firestore storing/restoring is disabled
    return null;
};
