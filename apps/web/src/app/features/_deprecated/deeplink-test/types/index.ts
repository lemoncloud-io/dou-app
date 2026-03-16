/**
 * Deeplink Test Types
 */

/**
 * User deeplink data from Firestore
 * Matches AdminDeeplinkDocument structure
 */
export interface UserDeeplinkData {
    id: string;
    deepLinkUrl: string;
    shortCode: string;
    invite: {
        id: string;
        code: string; // inviteCode used as shortCode
        userId: string;
        user$?: {
            id: string;
            name: string;
        };
    };
    createdAt: number;
    createdBy: string;
}
