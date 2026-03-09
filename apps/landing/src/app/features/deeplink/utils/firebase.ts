import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, Timestamp, doc, getDoc } from 'firebase/firestore';

import { DEEPLINK_CONFIG } from '../constants';
import { generateFingerprint } from './fingerprint';

import type { ShortLinkDocument } from '../types';

const getFirebaseConfig = () => ({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

const getFirebaseApp = () => {
    if (getApps().length > 0) {
        return getApp();
    }
    return initializeApp(getFirebaseConfig());
};

export const storeDeferredDeepLink = async (url: string): Promise<void> => {
    try {
        const app = getFirebaseApp();
        const db = getFirestore(app);
        const fingerprint = await generateFingerprint();
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + DEEPLINK_CONFIG.linkTtlHours * 60 * 60 * 1000));

        await addDoc(collection(db, DEEPLINK_CONFIG.collectionName), {
            fingerprint,
            deepLinkUrl: url,
            createdAt: serverTimestamp(),
            expiresAt,
        });

        console.log('[Deferred] Stored:', { fingerprint, url });
    } catch (error) {
        console.error('[Deferred] Failed to store:', error);
    }
};

/**
 * Fetch short link document by shortCode
 * @param shortCode - The short code (document ID in deferredDeepLinks collection)
 */
export const fetchShortLink = async (shortCode: string): Promise<ShortLinkDocument | null> => {
    try {
        const app = getFirebaseApp();
        const db = getFirestore(app);
        const docRef = doc(collection(db, DEEPLINK_CONFIG.collectionName), shortCode);
        const snapshot = await getDoc(docRef);

        if (!snapshot.exists()) {
            console.log('[ShortLink] Not found:', shortCode);
            return null;
        }

        const data = snapshot.data();
        console.log('[ShortLink] Found:', shortCode, data);

        return {
            id: snapshot.id,
            deepLinkUrl: data.deepLinkUrl,
            shortCode: data.shortCode,
            invite: data.invite,
            displayName: data.displayName,
            createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        };
    } catch (error) {
        console.error('[ShortLink] Failed to fetch:', error);
        return null;
    }
};
