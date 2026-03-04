/**
 * Invite Deep Link
 *
 * Create and manage invite deep links from mobile app.
 * Stores invite data in Firestore for later retrieval.
 */

import firestore from '@react-native-firebase/firestore';

import { DEEPLINK_DOMAIN, DEFERRED_LINKS_COLLECTION } from './constants';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/** Deep link URL base */
const DEEPLINK_BASE = `https://${DEEPLINK_DOMAIN}/s`;

/**
 * Invite link document structure stored in Firestore
 * Unified format for both Admin and Mobile
 */
export interface InviteLinkDocument {
    /** Deep link URL (https://app.chatic.io/s/{id}) */
    deepLinkUrl: string;
    /** Short code - also used as document ID */
    shortCode: string;
    /** Invite data from backend API */
    invite: MyInviteView;
    /** When the link was created */
    createdAt: FirebaseFirestore.Timestamp;
    /** Who created the link (user ID or identifier) */
    createdBy: string;
}

/**
 * Invite link result returned to caller
 */
export interface InviteLink {
    /** Document ID */
    id: string;
    /** Deep link URL to share */
    deepLinkUrl: string;
    /** Short code */
    shortCode: string;
}

/**
 * Create an invite deep link
 *
 * @param id - Unique identifier for the invite (used as document ID and in URL)
 * @param invite - MyInviteView data from backend API
 * @param createdBy - Creator identifier (user ID)
 * @returns Created invite link with URL
 */
export const createInviteLink = async (id: string, invite: MyInviteView, createdBy: string): Promise<InviteLink> => {
    const docRef = firestore().collection(DEFERRED_LINKS_COLLECTION).doc(id);

    // Check if already exists
    const existing = await docRef.get();
    if (existing.exists) {
        throw new Error('Invite link already exists for this ID');
    }

    const deepLinkUrl = `${DEEPLINK_BASE}/${id}`;
    const now = firestore.Timestamp.now();

    const data: InviteLinkDocument = {
        deepLinkUrl,
        shortCode: id,
        invite,
        createdAt: now,
        createdBy,
    };

    await docRef.set(data);

    console.log('[InviteLink] Created:', { id, deepLinkUrl });

    return {
        id,
        deepLinkUrl,
        shortCode: id,
    };
};

/**
 * Get an invite link by ID
 *
 * @param id - Invite link ID (document ID)
 * @returns Invite link data or null if not found
 */
export const getInviteLink = async (id: string): Promise<InviteLinkDocument | null> => {
    const docRef = firestore().collection(DEFERRED_LINKS_COLLECTION).doc(id);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
        return null;
    }

    return snapshot.data() as InviteLinkDocument;
};

/**
 * Check if an invite link exists
 *
 * @param id - Invite link ID
 * @returns true if exists
 */
export const checkInviteLinkExists = async (id: string): Promise<boolean> => {
    const docRef = firestore().collection(DEFERRED_LINKS_COLLECTION).doc(id);
    const snapshot = await docRef.get();
    return snapshot.exists;
};

/**
 * Delete an invite link
 *
 * @param id - Invite link ID to delete
 */
export const deleteInviteLink = async (id: string): Promise<void> => {
    const docRef = firestore().collection(DEFERRED_LINKS_COLLECTION).doc(id);
    await docRef.delete();
    console.log('[InviteLink] Deleted:', id);
};
