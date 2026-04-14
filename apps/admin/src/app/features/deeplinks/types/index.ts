/**
 * Deeplink Types for Admin Management
 */

import type { Timestamp } from 'firebase/firestore';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Firestore document structure for deeplinks
 * Collection: deferredDeepLinks
 *
 * Unified format for both Admin and Mobile.
 * Note: Deferred deeplink test data may not have invite/shortCode/createdBy fields.
 */
export interface AdminDeeplinkDocument {
    /** Deep link URL (https://app.chatic.io/s/{id}) */
    deepLinkUrl: string;
    /** Short code - also used as document ID (optional for deferred deeplink test data) */
    shortCode?: string;
    /** Invite data from backend API (optional for deferred deeplink test data) */
    invite?: MyInviteView;
    /** When the deeplink was created */
    createdAt: Timestamp;
    /** Who created the deeplink (optional for deferred deeplink test data) */
    createdBy?: string;
    /** Expiration time (deferred deeplink test data only) */
    expiresAt?: Timestamp;
    /** Device fingerprint (deferred deeplink test data only) */
    fingerprint?: string;
}

/**
 * Deeplink with document ID for list display
 */
export interface AdminDeeplink extends Omit<AdminDeeplinkDocument, 'createdAt'> {
    id: string;
    createdAt: number; // Converted to timestamp for display
    /** Display name - derived from invite.user$.name or id */
    displayName: string;
    /** Display ID - derived from invite.userId or id */
    displayId: string;
}

/**
 * Firebase configuration
 */
export interface FirebaseConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
}

/**
 * Firebase auth state
 */
export interface FirebaseAuthState {
    isAuthenticated: boolean;
    isAnonymous: boolean;
    isLoading: boolean;
    user: {
        email: string | null;
        uid: string;
    } | null;
    error: string | null;
}
