/**
 * Deeplink API Service
 *
 * Firestore CRUD operations for admin deeplinks.
 * Each user has one deeplink with userId as document ID.
 */

import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    limit,
    startAfter,
    Timestamp,
    getCountFromServer,
} from 'firebase/firestore';

import { firebaseService } from './firebase';

import type { DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import type { MyInviteView, UserView } from '@lemoncloud/chatic-backend-api';
import type { AdminDeeplink, AdminDeeplinkDocument } from '../types';

/** Deep link URL base */
const DEEPLINK_BASE = 'https://app.chatic.io/s';

/**
 * Derive display name from invite data
 */
const getDisplayName = (invite: MyInviteView, docId: string): string => {
    // From user$ embedded data
    if (invite.user$?.name) {
        return invite.user$.name;
    }
    // Fallback: document ID
    return docId;
};

/**
 * Derive display ID from invite data
 */
const getDisplayId = (invite: MyInviteView, docId: string): string => {
    // From userId field
    if (invite.userId) {
        return invite.userId;
    }
    // Fallback: document ID
    return docId;
};

/**
 * Legacy document structure (for backwards compatibility)
 */
interface LegacyDeeplinkDocument {
    deepLinkUrl: string;
    shortCode: string;
    user?: UserView;
    invite?: MyInviteView;
    createdAt: { toMillis: () => number };
    createdBy: string;
}

/**
 * Convert legacy user field to invite format
 */
const legacyUserToInvite = (user: UserView): MyInviteView => ({
    id: user.id,
    userId: user.id,
    user$: {
        id: user.id,
        name: user.name,
    },
});

/**
 * Convert Firestore document to AdminDeeplink
 * Handles both legacy (user field) and new (invite field) formats
 */
const convertDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): AdminDeeplink | null => {
    if (!doc.exists()) {
        return null;
    }

    const data = doc.data() as LegacyDeeplinkDocument;

    // Handle backwards compatibility: convert legacy user to invite
    let invite: MyInviteView;
    if (data.invite) {
        invite = data.invite;
    } else if (data.user) {
        invite = legacyUserToInvite(data.user);
    } else {
        invite = { id: doc.id, userId: doc.id } as MyInviteView;
    }

    return {
        id: doc.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode,
        invite,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
        createdBy: data.createdBy,
        displayName: getDisplayName(invite, doc.id),
        displayId: getDisplayId(invite, doc.id),
    };
};

/**
 * Convert UserView to MyInviteView for storage
 */
const userToInvite = (user: UserView): MyInviteView => ({
    id: user.id,
    userId: user.id,
    user$: {
        id: user.id,
        name: user.name,
    },
});

/**
 * Fetch all deeplinks with pagination
 */
export const fetchDeeplinks = async (params: {
    pageSize?: number;
    lastDoc?: DocumentSnapshot;
}): Promise<{ list: AdminDeeplink[]; lastDoc: DocumentSnapshot | null; total: number }> => {
    const { pageSize = 20, lastDoc } = params;
    const col = firebaseService.getDeeplinksCollection();

    // Get total count
    const countSnapshot = await getCountFromServer(col);
    const total = countSnapshot.data().count;

    // Build query
    let q = query(col, orderBy('createdAt', 'desc'), limit(pageSize));

    if (lastDoc) {
        q = query(col, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
    }

    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(convertDoc).filter((item): item is AdminDeeplink => item !== null);
    const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    return { list, lastDoc: newLastDoc, total };
};

/**
 * Fetch a single deeplink by user ID
 */
export const fetchDeeplinkByUserId = async (userId: string): Promise<AdminDeeplink | null> => {
    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, userId);
    const snapshot = await getDoc(docRef);
    return convertDoc(snapshot);
};

/**
 * Create a deeplink for a user
 * Uses userId as document ID (one link per user)
 */
export const createDeeplink = async (user: UserView): Promise<AdminDeeplink> => {
    const currentUser = firebaseService.getCurrentUser();
    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    const col = firebaseService.getDeeplinksCollection();
    const docId = user.id;
    const docRef = doc(col, docId);

    // Check if already exists
    const existing = await getDoc(docRef);
    if (existing.exists()) {
        throw new Error('Deeplink already exists for this user');
    }

    const deepLinkUrl = `${DEEPLINK_BASE}/${user.id}`;
    const now = Timestamp.now();
    const invite = userToInvite(user);

    const data: AdminDeeplinkDocument = {
        deepLinkUrl,
        shortCode: user.id,
        invite,
        createdAt: now,
        createdBy: currentUser.email || currentUser.uid,
    };

    await setDoc(docRef, data);

    return {
        id: docId,
        deepLinkUrl,
        shortCode: user.id,
        invite,
        createdAt: now.toMillis(),
        createdBy: data.createdBy,
        displayName: user.name,
        displayId: user.loginId || user.id,
    };
};

/**
 * Delete a deeplink
 */
export const deleteDeeplink = async (id: string): Promise<void> => {
    const currentUser = firebaseService.getCurrentUser();
    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, id);
    await deleteDoc(docRef);
};

/**
 * Check if a deeplink exists for a user
 */
export const checkDeeplinkExists = async (userId: string): Promise<boolean> => {
    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, userId);
    const snapshot = await getDoc(docRef);
    return snapshot.exists();
};
