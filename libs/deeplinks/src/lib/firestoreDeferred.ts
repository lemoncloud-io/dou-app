/**
 * Firestore-based Deferred Deep Linking
 *
 * Stores and retrieves deferred deep links using Firebase Firestore.
 * Web landing page stores the link, app retrieves it on first launch.
 */

import firestore from '@react-native-firebase/firestore';

import { DEFERRED_LINKS_COLLECTION, LINK_TTL_HOURS } from './constants';
import { generateFingerprint } from './fingerprint';

/**
 * Deferred link document structure
 */
export interface DeferredLinkDocument {
    fingerprint: string;
    deepLinkUrl: string;
    createdAt: FirebaseFirestore.Timestamp;
    expiresAt: FirebaseFirestore.Timestamp;
}

/**
 * Retrieve deferred deep link from Firestore
 * Called on app first launch to check if user came from a deep link
 *
 * @returns Deep link URL if found and not expired, null otherwise
 */
export const retrieveDeferredLinkFromFirestore = async (): Promise<string | null> => {
    try {
        const fingerprint = await generateFingerprint();
        console.log('[DeferredFirestore] Looking up fingerprint:', fingerprint);

        const now = firestore.Timestamp.now();

        // Query for matching fingerprint that hasn't expired
        const querySnapshot = await firestore()
            .collection(DEFERRED_LINKS_COLLECTION)
            .where('fingerprint', '==', fingerprint)
            .where('expiresAt', '>', now)
            .orderBy('expiresAt', 'desc')
            .limit(1)
            .get();

        if (querySnapshot.empty) {
            console.log('[DeferredFirestore] No matching deferred link found');
            return null;
        }

        const doc = querySnapshot.docs[0];
        const data = doc.data();

        // Runtime validation of document structure
        if (!data.fingerprint || !data.deepLinkUrl || !data.expiresAt) {
            console.error('[DeferredFirestore] Invalid document structure:', doc.id);
            await doc.ref.delete();
            return null;
        }

        console.log('[DeferredFirestore] Found deferred link:', data.deepLinkUrl);

        // Delete the document after retrieval (one-time use)
        await doc.ref.delete();

        return data.deepLinkUrl;
    } catch (error) {
        console.error('[DeferredFirestore] Error retrieving deferred link:', error);
        return null;
    }
};

/**
 * Store deferred deep link to Firestore (for testing from app)
 * In production, this should be called from the web landing page
 *
 * @param deepLinkUrl - The deep link URL to store
 * @returns true if stored successfully
 */
export const storeDeferredLinkToFirestore = async (deepLinkUrl: string): Promise<boolean> => {
    try {
        const fingerprint = await generateFingerprint();
        const now = firestore.Timestamp.now();
        const expiresAt = firestore.Timestamp.fromDate(new Date(Date.now() + LINK_TTL_HOURS * 60 * 60 * 1000));

        await firestore().collection(DEFERRED_LINKS_COLLECTION).add({
            fingerprint,
            deepLinkUrl,
            createdAt: now,
            expiresAt,
        });

        console.log('[DeferredFirestore] Stored deferred link:', { fingerprint, deepLinkUrl });
        return true;
    } catch (error) {
        console.error('[DeferredFirestore] Error storing deferred link:', error);
        return false;
    }
};

// NOTE: cleanupExpiredLinks has been moved to Cloud Functions
// See: docs/deep-linking-assets/firebase-functions/index.ts
