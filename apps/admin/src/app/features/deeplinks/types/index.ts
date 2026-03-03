/**
 * Deeplink Types for Admin Management
 */

import type { Timestamp } from 'firebase/firestore';
import type { UserView } from '@lemoncloud/chatic-backend-api';

/**
 * Firestore document structure for admin-created deeplinks
 * Collection: deferredDeepLinks
 */
export interface AdminDeeplinkDocument {
    /** Deep link URL (https://app.chatic.io/s/{userId}) */
    deepLinkUrl: string;
    /** Short code (userId) - also used as document ID */
    shortCode: string;
    /** Full user information */
    user: UserView;
    /** When the deeplink was created */
    createdAt: Timestamp;
    /** Admin who created the deeplink */
    createdBy: string;
}

/**
 * Deeplink with document ID for list display
 */
export interface AdminDeeplink extends Omit<AdminDeeplinkDocument, 'createdAt'> {
    id: string;
    createdAt: number; // Converted to timestamp for display
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
    isLoading: boolean;
    user: {
        email: string | null;
        uid: string;
    } | null;
    error: string | null;
}
