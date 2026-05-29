/**
 * Firestore-based Deferred Deep Linking
 *
 * Stores and retrieves deferred deep links using Firebase Firestore.
 * Web landing page stores the link, app retrieves it on first launch.
 */

/**
 * Deferred link document structure
 */
export interface DeferredLinkDocument {
    fingerprint: string;
    deepLinkUrl: string;
    createdAt: any;
    expiresAt: any;
}

export const retrieveDeferredLinkFromFirestore = async (): Promise<string | null> => {
    // Firestore deferred deep link retrieval is disabled
    return null;
};

export const storeDeferredLinkToFirestore = async (deepLinkUrl: string): Promise<boolean> => {
    // Firestore deferred deep link storing is disabled
    return false;
};

// NOTE: cleanupExpiredLinks has been moved to Cloud Functions
// See: docs/deep-linking-assets/firebase-functions/index.ts
