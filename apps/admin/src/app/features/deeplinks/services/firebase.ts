/**
 * Firebase Service Singleton
 *
 * Handles Firebase initialization with environment-based configuration.
 * Supports email/password authentication for admin access.
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';

import type { FirebaseApp } from 'firebase/app';
import type { Firestore, CollectionReference } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { FirebaseConfig } from '../types';

/** Firestore collection name for deferred deeplinks */
const COLLECTION_NAME = 'deferredDeepLinks';

/** Firebase app name for admin */
const APP_NAME = 'chatic-admin';

/**
 * Firebase configuration for dev environment (lemondu-ecb38)
 */
const DEV_CONFIG: FirebaseConfig = {
    apiKey: 'AIzaSyDJhO7CKBmo96duaWdwNn5mV3yKXAEwDD4',
    authDomain: 'lemondu-ecb38.firebaseapp.com',
    projectId: 'lemondu-ecb38',
    storageBucket: 'lemondu-ecb38.firebasestorage.app',
    messagingSenderId: '429595905351',
    appId: '1:429595905351:web:a1866c5f60565098abd062',
    measurementId: 'G-M8FFL54LLP',
};

/**
 * Firebase configuration for prod environment (chaticdou)
 */
const PROD_CONFIG: FirebaseConfig = {
    apiKey: 'AIzaSyAPClw_7zjDNGTdAnwVvlqyL-W53ATsnrE',
    authDomain: 'chaticdou.firebaseapp.com',
    projectId: 'chaticdou',
    storageBucket: 'chaticdou.firebasestorage.app',
    messagingSenderId: '884488290426',
    appId: '1:884488290426:web:cc3663c181f5800385bbc3',
    measurementId: 'G-HZTHHWPB7Q',
};

/**
 * Get Firebase config based on environment
 */
const getConfig = (): FirebaseConfig => {
    const env = import.meta.env.VITE_ENV;
    return env === 'PROD' ? PROD_CONFIG : DEV_CONFIG;
};

/**
 * Firebase Service Class
 * Singleton pattern for managing Firebase instances
 */
class FirebaseService {
    private app: FirebaseApp | null = null;
    private firestore: Firestore | null = null;
    private auth: Auth | null = null;
    private initialized = false;

    /**
     * Initialize Firebase with environment-based config
     */
    initialize(): void {
        if (this.initialized) {
            return;
        }

        const config = getConfig();

        // Check if app already exists
        const existingApps = getApps();
        const existingApp = existingApps.find(app => app.name === APP_NAME);

        if (existingApp) {
            this.app = existingApp;
        } else {
            this.app = initializeApp(config, APP_NAME);
        }

        this.firestore = getFirestore(this.app);
        this.auth = getAuth(this.app);
        this.initialized = true;

        console.log('[FirebaseService] Initialized for project:', config.projectId);
    }

    /**
     * Get Firebase app instance
     */
    getApp(): FirebaseApp {
        if (!this.app) {
            this.initialize();
        }
        if (!this.app) {
            throw new Error('Firebase app not initialized');
        }
        return this.app;
    }

    /**
     * Get Firestore instance
     */
    getFirestore(): Firestore {
        if (!this.firestore) {
            this.initialize();
        }
        if (!this.firestore) {
            throw new Error('Firestore not initialized');
        }
        return this.firestore;
    }

    /**
     * Get Auth instance
     */
    getAuth(): Auth {
        if (!this.auth) {
            this.initialize();
        }
        if (!this.auth) {
            throw new Error('Firebase Auth not initialized');
        }
        return this.auth;
    }

    /**
     * Get admin deeplinks collection reference
     */
    getDeeplinksCollection(): CollectionReference {
        return collection(this.getFirestore(), COLLECTION_NAME);
    }

    /**
     * Sign in with email and password
     */
    async signIn(email: string, password: string): Promise<User> {
        const auth = this.getAuth();
        const result = await signInWithEmailAndPassword(auth, email, password);
        return result.user;
    }

    /**
     * Sign out current user
     */
    async signOut(): Promise<void> {
        const auth = this.getAuth();
        await firebaseSignOut(auth);
    }

    /**
     * Get current user
     */
    getCurrentUser(): User | null {
        return this.getAuth().currentUser;
    }

    /**
     * Subscribe to auth state changes
     */
    onAuthStateChanged(callback: (user: User | null) => void): () => void {
        const auth = this.getAuth();
        return onAuthStateChanged(auth, callback);
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated(): boolean {
        return this.getCurrentUser() !== null;
    }
}

/** Singleton instance */
export const firebaseService = new FirebaseService();
