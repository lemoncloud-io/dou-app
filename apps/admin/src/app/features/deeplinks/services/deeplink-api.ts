/**
 * Deeplink API Service
 *
 * Firestore CRUD operations for admin deeplinks.
 * Supports both DEV and PROD environments.
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
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { AdminDeeplink, AdminDeeplinkDocument, DeeplinkEnvironment } from '../types';

/**
 * Convert Firestore document to AdminDeeplink
 * Handles both admin-created deeplinks and deferred deeplink test data
 */
const convertDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): AdminDeeplink | null => {
    if (!doc.exists()) {
        return null;
    }

    const data = doc.data() as AdminDeeplinkDocument;

    return {
        id: doc.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode ?? doc.id,
        invite: data.invite,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
        createdBy: data.createdBy ?? 'unknown',
        displayName: data.invite?.user$?.name ?? doc.id,
        displayId: data.invite?.userId ?? doc.id,
    };
};

/**
 * Fetch all deeplinks with pagination for specific environment
 */
export const fetchDeeplinks = async (
    env: DeeplinkEnvironment,
    params: {
        pageSize?: number;
        lastDoc?: DocumentSnapshot;
    }
): Promise<{ list: AdminDeeplink[]; lastDoc: DocumentSnapshot | null; total: number }> => {
    const { pageSize = 20, lastDoc } = params;
    const col = firebaseService.getDeeplinksCollection(env);

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
 * Fetch a single deeplink by user ID for specific environment
 */
export const fetchDeeplinkByUserId = async (
    env: DeeplinkEnvironment,
    userId: string
): Promise<AdminDeeplink | null> => {
    const col = firebaseService.getDeeplinksCollection(env);
    const docRef = doc(col, userId);
    const snapshot = await getDoc(docRef);
    return convertDoc(snapshot);
};

/**
 * Create a deeplink from MyInviteView (from backend invite API)
 * Uses invite.userId as document ID (one link per user)
 */
export const createDeeplinkFromInvite = async (
    env: DeeplinkEnvironment,
    invite: MyInviteView
): Promise<AdminDeeplink> => {
    const currentUser = firebaseService.getCurrentUser(env);
    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    const userId = invite.userId;
    if (!userId) {
        throw new Error('Invite must have userId');
    }

    const col = firebaseService.getDeeplinksCollection(env);
    const docId = userId;
    const docRef = doc(col, docId);

    // Check if already exists
    const existing = await getDoc(docRef);
    if (existing.exists()) {
        throw new Error('Deeplink already exists for this user');
    }

    const urlBase = firebaseService.getDeeplinkUrlBase(env);
    const deepLinkUrl = `${urlBase}/${userId}`;
    const now = Timestamp.now();

    const data: AdminDeeplinkDocument = {
        deepLinkUrl,
        shortCode: userId,
        invite,
        createdAt: now,
        createdBy: currentUser.isAnonymous ? 'anonymous-admin' : currentUser.email || currentUser.uid,
    };

    await setDoc(docRef, data);

    const displayName = invite.user$?.name ?? invite.name ?? userId;

    return {
        id: docId,
        deepLinkUrl,
        shortCode: userId,
        invite,
        createdAt: now.toMillis(),
        createdBy: data.createdBy,
        displayName,
        displayId: userId,
    };
};

/**
 * Delete a deeplink in specific environment
 */
export const deleteDeeplink = async (env: DeeplinkEnvironment, id: string): Promise<void> => {
    const currentUser = firebaseService.getCurrentUser(env);
    if (!currentUser) {
        throw new Error('Not authenticated');
    }

    const col = firebaseService.getDeeplinksCollection(env);
    const docRef = doc(col, id);
    await deleteDoc(docRef);
};
