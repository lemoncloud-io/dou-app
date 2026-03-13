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

const DEV_CONFIG = {
    apiKey: 'AIzaSyDJhO7CKBmo96duaWdwNn5mV3yKXAEwDD4',
    authDomain: 'lemondu-ecb38.firebaseapp.com',
    projectId: 'lemondu-ecb38',
    storageBucket: 'lemondu-ecb38.firebasestorage.app',
    messagingSenderId: '429595905351',
    appId: '1:429595905351:web:a1866c5f60565098abd062',
    measurementId: 'G-M8FFL54LLP',
};

const PROD_CONFIG = {
    apiKey: 'AIzaSyAPClw_7zjDNGTdAnwVvlqyL-W53ATsnrE',
    authDomain: 'chaticdou.firebaseapp.com',
    projectId: 'chaticdou',
    storageBucket: 'chaticdou.firebasestorage.app',
    messagingSenderId: '884488290426',
    appId: '1:884488290426:web:cc3663c181f5800385bbc3',
    measurementId: 'G-HZTHHWPB7Q',
};

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

        const env = getEnv();
        const config = env === 'PROD' ? PROD_CONFIG : DEV_CONFIG;

        const existingApps = getApps();
        this.app = existingApps.find(a => a.name === APP_NAME) ?? initializeApp(config, APP_NAME);
        this.db = getFirestore(this.app);
        this.auth = getAuth(this.app);

        console.log(`[FirebaseDeeplinkService] Initialized for ${env}`);

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
