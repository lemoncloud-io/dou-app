/**
 * Firebase Service for Deeplink Test (Web)
 *
 * Simple Firebase initialization for DEV environment only.
 * Used to read deeplink data from Firestore.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';

import type { FirebaseApp } from 'firebase/app';
import type { Firestore, CollectionReference } from 'firebase/firestore';

/** Firestore collection name for deferred deeplinks */
const COLLECTION_NAME = 'deferredDeepLinks';

/** Firebase app name for web deeplink test */
const APP_NAME = 'chatic-web-deeplink-test';

/**
 * Firebase configuration for dev environment (REDACTED_FIREBASE_PROJECT)
 */
const DEV_CONFIG = {
    apiKey: 'REDACTED_FIREBASE_API_KEY',
    authDomain: 'REDACTED_FIREBASE_PROJECT.firebaseapp.com',
    projectId: 'REDACTED_FIREBASE_PROJECT',
    storageBucket: 'REDACTED_FIREBASE_PROJECT.firebasestorage.app',
    messagingSenderId: '429595905351',
    appId: '1:429595905351:web:a1866c5f60565098abd062',
    measurementId: 'G-M8FFL54LLP',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

/**
 * Initialize Firebase app
 */
const initializeFirebase = (): FirebaseApp => {
    if (app) {
        return app;
    }

    const existingApps = getApps();
    const existingApp = existingApps.find(a => a.name === APP_NAME);

    if (existingApp) {
        app = existingApp;
    } else {
        app = initializeApp(DEV_CONFIG, APP_NAME);
    }

    console.log('[DeeplinkTest Firebase] Initialized');
    return app;
};

/**
 * Get Firestore instance
 */
export const getFirestoreInstance = (): Firestore => {
    if (db) {
        return db;
    }

    const firebaseApp = initializeFirebase();
    db = getFirestore(firebaseApp);
    return db;
};

/**
 * Get deeplinks collection reference
 */
export const getDeeplinksCollection = (): CollectionReference => {
    return collection(getFirestoreInstance(), COLLECTION_NAME);
};
