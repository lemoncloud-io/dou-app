/**
 * Firebase Service for Admin Deeplinks
 *
 * Single Firebase instance determined by deployment environment (VITE_ENV).
 * Supports anonymous authentication for admin access.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';
import {
    getAuth,
    signInAnonymously as firebaseSignInAnonymously,
    signOut as firebaseSignOut,
    onAuthStateChanged,
} from 'firebase/auth';

import type { FirebaseApp } from 'firebase/app';
import type { Firestore, CollectionReference } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { FirebaseConfig } from '../types';

/** Firestore collection name for deferred deeplinks */
const COLLECTION_NAME = 'deferredDeepLinks';

/** Firebase app name for admin */
const APP_NAME = 'chatic-admin';

/** Current environment from VITE_ENV */
const IS_PROD = import.meta.env.VITE_ENV === 'PROD';

/** Deep link URL base determined by environment */
export const DEEPLINK_URL_BASE = IS_PROD ? 'https://app.chatic.io/s' : 'https://app-dev.chatic.io/s';

/** Firebase config from environment variables */
const FIREBASE_CONFIG: FirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

/**
 * Firebase Service Class
 * Single Firebase instance for the current deployment environment
 */
class FirebaseService {
    private app: FirebaseApp | null = null;
    private _firestore: Firestore | null = null;
    private _auth: Auth | null = null;

    initialize(): { app: FirebaseApp; firestore: Firestore; auth: Auth } {
        if (this.app && this._firestore && this._auth) {
            return { app: this.app, firestore: this._firestore, auth: this._auth };
        }

        const existingApps = getApps();
        this.app = existingApps.find(a => a.name === APP_NAME) ?? initializeApp(FIREBASE_CONFIG, APP_NAME);
        this._firestore = getFirestore(this.app);
        this._auth = getAuth(this.app);

        console.log(`[FirebaseService] Initialized (${FIREBASE_CONFIG.projectId})`);

        return { app: this.app, firestore: this._firestore, auth: this._auth };
    }

    getFirestore(): Firestore {
        return this.initialize().firestore;
    }

    getAuth(): Auth {
        return this.initialize().auth;
    }

    getDeeplinksCollection(): CollectionReference {
        return collection(this.getFirestore(), COLLECTION_NAME);
    }

    async signInAnonymously(): Promise<User> {
        const auth = this.getAuth();
        if (auth.currentUser) return auth.currentUser;
        const result = await firebaseSignInAnonymously(auth);
        return result.user;
    }

    async signOut(): Promise<void> {
        await firebaseSignOut(this.getAuth());
    }

    getCurrentUser(): User | null {
        return this.getAuth().currentUser;
    }

    onAuthStateChanged(callback: (user: User | null) => void): () => void {
        return onAuthStateChanged(this.getAuth(), callback);
    }

    isAuthenticated(): boolean {
        return this.getCurrentUser() !== null;
    }

    getDeeplinkUrlBase(): string {
        return DEEPLINK_URL_BASE;
    }
}

/** Singleton instance */
export const firebaseService = new FirebaseService();
