/**
 * Deeplink Types for Admin Management
 */

import type { Timestamp } from 'firebase/firestore';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/**
 * Firestore document structure for deeplinks
 * Collection: deferredDeepLinks
 *
 * Unified format for both Admin and Mobile
 */
export interface AdminDeeplinkDocument {
    /** Deep link URL (https://app.chatic.io/s/{id}) */
    deepLinkUrl: string;
    /** Short code - also used as document ID */
    shortCode: string;
    /** Invite data from backend API */
    invite: MyInviteView;
    /** When the deeplink was created */
    createdAt: Timestamp;
    /** Who created the deeplink */
    createdBy: string;
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
