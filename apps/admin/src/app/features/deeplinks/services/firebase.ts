/**
 * Firebase Service for Admin Deeplinks
 *
 * Manages dual Firebase instances (DEV/PROD) for deeplink management.
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
import type { FirebaseConfig, DeeplinkEnvironment } from '../types';

/** Firestore collection name for deferred deeplinks */
const COLLECTION_NAME = 'deferredDeepLinks';

/** Firebase app name prefix for admin */
const APP_NAME_PREFIX = 'chatic-admin';

/** Deep link URL bases by environment */
export const DEEPLINK_URLS: Record<DeeplinkEnvironment, string> = {
    DEV: 'https://app-dev.chatic.io/s',
    PROD: 'https://app.chatic.io/s',
};

/**
 * Firebase configuration for dev environment (REDACTED_FIREBASE_PROJECT)
 */
const DEV_CONFIG: FirebaseConfig = {
    apiKey: 'REDACTED_FIREBASE_API_KEY',
    authDomain: 'REDACTED_FIREBASE_PROJECT.firebaseapp.com',
    projectId: 'REDACTED_FIREBASE_PROJECT',
    storageBucket: 'REDACTED_FIREBASE_PROJECT.firebasestorage.app',
    messagingSenderId: '429595905351',
    appId: '1:429595905351:web:a1866c5f60565098abd062',
    measurementId: 'G-M8FFL54LLP',
};

/**
 * Firebase configuration for prod environment (REDACTED_FIREBASE_PROJECT)
 */
const PROD_CONFIG: FirebaseConfig = {
    apiKey: 'REDACTED_FIREBASE_API_KEY',
    authDomain: 'REDACTED_FIREBASE_PROJECT.firebaseapp.com',
    projectId: 'REDACTED_FIREBASE_PROJECT',
    storageBucket: 'REDACTED_FIREBASE_PROJECT.firebasestorage.app',
    messagingSenderId: '884488290426',
    appId: '1:884488290426:web:cc3663c181f5800385bbc3',
    measurementId: 'G-HZTHHWPB7Q',
};

/**
 * Get Firebase config for environment
 */
const getConfigForEnv = (env: DeeplinkEnvironment): FirebaseConfig => {
    return env === 'PROD' ? PROD_CONFIG : DEV_CONFIG;
};

/**
 * Get app name for environment
 */
const getAppName = (env: DeeplinkEnvironment): string => {
    return `${APP_NAME_PREFIX}-${env.toLowerCase()}`;
};

/**
 * Firebase instance for a specific environment
 */
interface FirebaseInstance {
    app: FirebaseApp;
    firestore: Firestore;
    auth: Auth;
    env: DeeplinkEnvironment;
}

/**
 * Firebase Service Class
 * Manages dual Firebase instances for DEV and PROD environments
 */
class FirebaseService {
    private instances: Map<DeeplinkEnvironment, FirebaseInstance> = new Map();

    /**
     * Initialize Firebase for a specific environment
     */
    initializeForEnv(env: DeeplinkEnvironment): FirebaseInstance {
        // Return existing instance if already initialized
        const existing = this.instances.get(env);
        if (existing) {
            return existing;
        }

        const config = getConfigForEnv(env);
        const appName = getAppName(env);

        // Check if app already exists
        const existingApps = getApps();
        let app = existingApps.find(a => a.name === appName);

        if (!app) {
            app = initializeApp(config, appName);
        }

        const firestore = getFirestore(app);
        const auth = getAuth(app);

        const instance: FirebaseInstance = { app, firestore, auth, env };
        this.instances.set(env, instance);

        console.log(`[FirebaseService] Initialized for ${env} (${config.projectId})`);

        return instance;
    }

    /**
     * Get Firebase instance for environment
     */
    private getInstance(env: DeeplinkEnvironment): FirebaseInstance {
        let instance = this.instances.get(env);
        if (!instance) {
            instance = this.initializeForEnv(env);
        }
        return instance;
    }

    /**
     * Get Firestore instance for environment
     */
    getFirestore(env: DeeplinkEnvironment): Firestore {
        return this.getInstance(env).firestore;
    }

    /**
     * Get Auth instance for environment
     */
    getAuth(env: DeeplinkEnvironment): Auth {
        return this.getInstance(env).auth;
    }

    /**
     * Get deeplinks collection reference for environment
     */
    getDeeplinksCollection(env: DeeplinkEnvironment): CollectionReference {
        return collection(this.getFirestore(env), COLLECTION_NAME);
    }

    /**
     * Sign in anonymously for environment
     */
    async signInAnonymously(env: DeeplinkEnvironment): Promise<User> {
        const auth = this.getAuth(env);

        // Return existing user if already signed in
        if (auth.currentUser) {
            return auth.currentUser;
        }

        const result = await firebaseSignInAnonymously(auth);
        return result.user;
    }

    /**
     * Sign out from environment
     */
    async signOut(env: DeeplinkEnvironment): Promise<void> {
        const auth = this.getAuth(env);
        await firebaseSignOut(auth);
    }

    /**
     * Get current user for environment
     */
    getCurrentUser(env: DeeplinkEnvironment): User | null {
        return this.getAuth(env).currentUser;
    }

    /**
     * Subscribe to auth state changes for environment
     */
    onAuthStateChanged(env: DeeplinkEnvironment, callback: (user: User | null) => void): () => void {
        const auth = this.getAuth(env);
        return onAuthStateChanged(auth, callback);
    }

    /**
     * Check if user is authenticated for environment
     */
    isAuthenticated(env: DeeplinkEnvironment): boolean {
        return this.getCurrentUser(env) !== null;
    }

    /**
     * Get deeplink URL base for environment
     */
    getDeeplinkUrlBase(env: DeeplinkEnvironment): string {
        return DEEPLINK_URLS[env];
    }
}

/** Singleton instance */
export const firebaseService = new FirebaseService();
