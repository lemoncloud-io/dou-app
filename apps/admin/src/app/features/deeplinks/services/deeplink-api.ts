/**
 * Deeplink API Service
 *
 * Firestore CRUD operations for admin deeplinks.
 * Each invite has one deeplink with inviteCode as document ID.
 */

import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    writeBatch,
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
import type { AdminDeeplink, AdminDeeplinkDocument } from '../types';

/**
 * Convert Firestore document to AdminDeeplink
 */
const convertDoc = (doc: QueryDocumentSnapshot | DocumentSnapshot): AdminDeeplink | null => {
    if (!doc.exists()) return null;

    const data = doc.data() as AdminDeeplinkDocument;
    const displayName = data.invite?.user$?.name ?? data.fingerprint ?? doc.id;
    const displayId = data.invite?.userId ?? (data.fingerprint ? '[DEFERRED]' : doc.id);

    return {
        id: doc.id,
        deepLinkUrl: data.deepLinkUrl,
        shortCode: data.shortCode ?? doc.id,
        invite: data.invite,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
        createdBy: data.createdBy ?? 'unknown',
        displayName,
        displayId,
    };
};

/**
 * Fetch deeplinks with pagination
 */
export const fetchDeeplinks = async (params: {
    pageSize?: number;
    lastDoc?: DocumentSnapshot;
}): Promise<{ list: AdminDeeplink[]; lastDoc: DocumentSnapshot | null; total: number }> => {
    const { pageSize = 20, lastDoc } = params;
    const col = firebaseService.getDeeplinksCollection();

    const countSnapshot = await getCountFromServer(col);
    const total = countSnapshot.data().count;

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
 * Fetch a single deeplink by short code
 */
export const fetchDeeplinkByShortCode = async (shortCode: string): Promise<AdminDeeplink | null> => {
    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, shortCode);
    const snapshot = await getDoc(docRef);
    return convertDoc(snapshot);
};

/**
 * Create a deeplink from MyInviteView
 */
export const createDeeplinkFromInvite = async (invite: MyInviteView): Promise<AdminDeeplink> => {
    const currentUser = firebaseService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const inviteCode = invite.code;
    if (!inviteCode) throw new Error('Invite must have inviteCode');

    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, inviteCode);

    const existing = await getDoc(docRef);
    if (existing.exists()) throw new Error('Deeplink already exists for this invite code');

    const urlBase = firebaseService.getDeeplinkUrlBase();
    const deepLinkUrl = `${urlBase}/${inviteCode}`;
    const now = Timestamp.now();

    const data: AdminDeeplinkDocument = {
        deepLinkUrl,
        shortCode: inviteCode,
        invite,
        createdAt: now,
        createdBy: currentUser.isAnonymous ? 'anonymous-admin' : currentUser.email || currentUser.uid,
    };

    await setDoc(docRef, data);

    const displayName = invite.user$?.name ?? invite.name ?? invite.userId ?? inviteCode;

    return {
        id: inviteCode,
        deepLinkUrl,
        shortCode: inviteCode,
        invite,
        createdAt: now.toMillis(),
        createdBy: data.createdBy,
        displayName,
        displayId: invite.userId ?? inviteCode,
    };
};

/**
 * Delete a deeplink
 */
export const deleteDeeplink = async (id: string): Promise<void> => {
    const currentUser = firebaseService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const col = firebaseService.getDeeplinksCollection();
    const docRef = doc(col, id);
    await deleteDoc(docRef);
};

/**
 * Delete all deeplinks (batch, max 500 per batch)
 */
export const deleteAllDeeplinks = async (): Promise<number> => {
    const currentUser = firebaseService.getCurrentUser();
    if (!currentUser) throw new Error('Not authenticated');

    const col = firebaseService.getDeeplinksCollection();
    const snapshot = await getDocs(query(col));

    if (snapshot.empty) return 0;

    const BATCH_SIZE = 500;
    const firestore = firebaseService.getFirestore();
    let deletedCount = 0;

    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(d => batch.delete(d.ref));
        await batch.commit();
        deletedCount += chunk.length;
    }

    return deletedCount;
};
