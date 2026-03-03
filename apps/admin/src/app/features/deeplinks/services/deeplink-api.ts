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
import type { UserView } from '@lemoncloud/chatic-backend-api';
import type { AdminDeeplink, AdminDeeplinkDocument } from '../types';

/** Deep link URL base */
const DEEPLINK_BASE = 'https://app.chatic.io/s';

/**
 * Convert Firestore document to AdminDeeplink
 */
const convertDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): AdminDeeplink | null => {
    if (!doc.exists()) {
        return null;
    }

    const data = doc.data() as AdminDeeplinkDocument;
    return {
        id: doc.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode,
        user: data.user,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
        createdBy: data.createdBy,
    };
};

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

    const data: AdminDeeplinkDocument = {
        deepLinkUrl,
        shortCode: user.id,
        user,
        createdAt: now,
        createdBy: currentUser.email || currentUser.uid,
    };

    await setDoc(docRef, data);

    return {
        id: docId,
        deepLinkUrl,
        shortCode: user.id,
        user,
        createdAt: now.toMillis(),
        createdBy: data.createdBy,
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
