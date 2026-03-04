/**
 * User Deeplink API Service
 *
 * Fetches user deeplink data from Firestore
 */

import { doc, getDoc } from 'firebase/firestore';

import { getDeeplinksCollection } from './firebase';

import type { UserDeeplinkData } from '../types';

/**
 * Fetch user deeplink data by user ID
 *
 * @param userId - User ID (also document ID)
 * @returns User deeplink data or null if not found
 */
export const fetchUserDeeplink = async (userId: string): Promise<UserDeeplinkData | null> => {
    const col = getDeeplinksCollection();
    const docRef = doc(col, userId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
        return null;
    }

    const data = snapshot.data();

    return {
        id: snapshot.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode,
        invite: data.invite,
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        createdBy: data.createdBy,
    };
};
