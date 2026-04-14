/**
 * Firebase Service for Deeplinks
 *
 * Manages Firebase instance for deeplink creation in web app.
 * Environment is determined by VITE_ENV (DEV/PROD).
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously as firebaseSignInAnonymously } from 'firebase/auth';

import type { FirebaseApp } from 'firebase/app';
import type { Firestore, CollectionReference } from 'firebase/firestore';
import type { Auth, User } from 'firebase/auth';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

type Environment = 'DEV' | 'PROD';

const COLLECTION_NAME = 'deferredDeepLinks';
const APP_NAME = 'chatic-web-invite';

const getFirebaseConfig = () => ({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
});

const DEEPLINK_URLS: Record<Environment, string> = {
    DEV: 'https://app-dev.chatic.io/s',
    PROD: 'https://app.chatic.io/s',
};

const getEnv = (): Environment => (import.meta.env.VITE_ENV === 'PROD' ? 'PROD' : 'DEV');

class FirebaseDeeplinkService {
    private app: FirebaseApp | null = null;
    private db: Firestore | null = null;
    private auth: Auth | null = null;

    private initialize(): { app: FirebaseApp; db: Firestore; auth: Auth } {
        if (this.app && this.db && this.auth) {
            return { app: this.app, db: this.db, auth: this.auth };
        }

        const config = getFirebaseConfig();

        const existingApps = getApps();
        this.app = existingApps.find(a => a.name === APP_NAME) ?? initializeApp(config, APP_NAME);
        this.db = getFirestore(this.app);
        this.auth = getAuth(this.app);

        console.log(`[FirebaseDeeplinkService] Initialized for ${getEnv()} (project: ${config.projectId})`);

        return { app: this.app, db: this.db, auth: this.auth };
    }

    private getCollection(): CollectionReference {
        const { db } = this.initialize();
        return collection(db, COLLECTION_NAME);
    }

    async signInAnonymously(): Promise<User> {
        const { auth } = this.initialize();

        if (auth.currentUser) {
            return auth.currentUser;
        }

        const result = await firebaseSignInAnonymously(auth);
        return result.user;
    }

    async createDeeplink(invite: MyInviteView): Promise<string> {
        const { auth } = this.initialize();

        if (!auth.currentUser) {
            await this.signInAnonymously();
        }

        const inviteCode = invite.code;
        if (!inviteCode) {
            throw new Error('Invite must have code');
        }

        const env = getEnv();
        const deepLinkUrl = `${DEEPLINK_URLS[env]}/${inviteCode}`;
        const col = this.getCollection();
        const docRef = doc(col, inviteCode);

        // Backend WebSocket response already includes $envs and Location.
        // Don't override — just store invite as-is.
        await setDoc(docRef, {
            deepLinkUrl,
            shortCode: inviteCode,
            invite,
            createdAt: Timestamp.now(),
            createdBy: 'web-user',
        });

        return deepLinkUrl;
    }
}

export const firebaseDeeplinkService = new FirebaseDeeplinkService();
