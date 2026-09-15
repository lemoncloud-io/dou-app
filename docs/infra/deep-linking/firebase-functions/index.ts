/**
 * Firebase Cloud Functions for Deferred Deep Link Cleanup
 *
 * Deploy to your Firebase project:
 * 1. Copy this folder to your Firebase Functions project
 * 2. Run: firebase deploy --only functions
 *
 * Functions:
 * - cleanupExpiredDeferredLinks: Runs every hour to delete expired links
 * - cleanupExpiredDeferredLinksHttp: HTTP endpoint for manual trigger
 */

import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';

// Initialize Firebase Admin
admin.initializeApp();

const DEFERRED_LINKS_COLLECTION = 'deferredDeepLinks';

/**
 * Scheduled function: Runs every hour to clean up expired deferred links
 *
 * Schedule: Every hour at minute 0
 * Timezone: Asia/Seoul
 */
export const cleanupExpiredDeferredLinks = onSchedule(
    {
        schedule: '0 * * * *', // Every hour at minute 0
        timeZone: 'Asia/Seoul',
        retryCount: 3,
    },
    async () => {
        const deletedCount = await deleteExpiredLinks();
        console.log(`[Cleanup] Scheduled cleanup completed. Deleted ${deletedCount} expired links.`);
    }
);

/**
 * HTTP endpoint for manual cleanup trigger
 *
 * Usage: curl https://your-region-your-project.cloudfunctions.net/cleanupExpiredDeferredLinksHttp
 */
export const cleanupExpiredDeferredLinksHttp = onRequest(
    {
        cors: false,
    },
    async (req, res) => {
        // Optional: Add authentication check
        // const authHeader = req.headers.authorization;
        // if (!authHeader || authHeader !== 'Bearer YOUR_SECRET_TOKEN') {
        //     res.status(401).send('Unauthorized');
        //     return;
        // }

        const deletedCount = await deleteExpiredLinks();
        res.json({
            success: true,
            deletedCount,
            message: `Deleted ${deletedCount} expired links`,
        });
    }
);

/**
 * Delete all expired deferred links from Firestore
 *
 * @returns Number of deleted documents
 */
async function deleteExpiredLinks(): Promise<number> {
    const firestore = admin.firestore();
    const now = admin.firestore.Timestamp.now();

    try {
        // Query for expired documents
        const expiredSnapshot = await firestore
            .collection(DEFERRED_LINKS_COLLECTION)
            .where('expiresAt', '<', now)
            .limit(500) // Process in batches to avoid timeout
            .get();

        if (expiredSnapshot.empty) {
            console.log('[Cleanup] No expired links found');
            return 0;
        }

        // Batch delete for efficiency
        const batch = firestore.batch();
        expiredSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log(`[Cleanup] Deleted ${expiredSnapshot.size} expired links`);

        // If we hit the limit, there might be more to delete
        if (expiredSnapshot.size === 500) {
            console.log('[Cleanup] More expired links may exist, will be cleaned in next run');
        }

        return expiredSnapshot.size;
    } catch (error) {
        console.error('[Cleanup] Error deleting expired links:', error);
        throw error;
    }
}
