/**
 * User Deeplink API Service
 *
 * Fetches user deeplink data from Firestore
 */

import { doc, getDoc } from 'firebase/firestore';

import { getDeeplinksCollection } from './firebase';

import type { UserDeeplinkData } from '../types';

/** Firestore document structure for deeplinks */
interface DeeplinkDocument {
    deepLinkUrl: string;
    shortCode: string;
    invite: UserDeeplinkData['invite'];
    createdAt?: { toMillis: () => number };
    createdBy: string;
}

/**
 * Fetch deeplink data by short code (inviteCode)
 *
 * @param shortCode - Short code (inviteCode from backend, also document ID)
 * @returns Deeplink data or null if not found
 */
export const fetchDeeplinkByShortCode = async (shortCode: string): Promise<UserDeeplinkData | null> => {
    const col = getDeeplinksCollection();
    const docRef = doc(col, shortCode);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.data() as DeeplinkDocument;

    return {
        id: snapshot.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode,
        invite: data.invite,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
        createdBy: data.createdBy,
    };
};
