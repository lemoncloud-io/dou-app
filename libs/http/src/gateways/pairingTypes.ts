import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * TEMPORARY — the `/pairings/**` wire types, copied from chatic-backend-api 0.26.1001
 * (`modules/pairing/views.ts` · `types.ts`) because no published release of
 * `@lemoncloud/chatic-backend-api` carries them yet (the latest on npm is 0.26.820).
 *
 * The app does not keep copies of server types: once a release with them is published, this file is
 * deleted and every import below switches to the package. Nothing here may grow beyond what the
 * server declares — a field the app needs that the server does not send is not added here.
 */

/** `PairingStatus` */
export type PairingStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';

/** `PairingPurpose` — `debug` is the developer tool's purpose; the app only ever requests `web`. */
export type PairingPurpose = 'web' | 'debug';

/** `PairingTargetType` */
export type PairingTargetType = 'relay' | 'cloud';

/** `PairingClient` — what the requesting device shows about itself. `userAgent` is filled in by the server. */
export interface PairingClient {
    name?: string;
    platform?: string;
    userAgent?: string;
}

/** `PairingTarget` — where an approval lets the requester in. `cloudId` only for a cloud target. */
export interface PairingTarget {
    type: PairingTargetType;
    cloudId?: string;
}

/** `PairingRequestBody` — `POST /pairings/0/request`. */
export interface PairingRequestBody {
    purpose: PairingPurpose;
    deviceId: string;
    client?: { name?: string; platform?: string };
}

/** `PairingRequestView` — the code to show, when it expires (epoch ms) and how often to claim (seconds). */
export interface PairingRequestView {
    pairingId: string;
    code: string;
    expiredAt: number;
    interval: number;
}

/** `PairingCheckBody` — `POST /pairings/0/check`. */
export interface PairingCheckBody {
    code: string;
}

/** `PairingCheckView` */
export interface PairingCheckView {
    pairingId: string;
    purpose: PairingPurpose;
    deviceId: string;
    client: PairingClient;
    expiredAt: number;
}

/** `PairingApproveBody` — `POST /pairings/{id}/approve`. */
export interface PairingApproveBody {
    target: PairingTarget;
}

/** `PairingDecisionView` — the answer to `approve` · `deny` · `revoke`. */
export interface PairingDecisionView {
    pairingId: string;
    status: PairingStatus;
}

/**
 * `PairingClaimView` — `POST /pairings/{id}/claim`. A relay approval carries `session` on the first
 * `approved` answer only; every later claim answers `claimed`. A cloud approval never carries one.
 */
export type PairingClaimView =
    | { status: 'pending' | 'expired' | 'denied' | 'revoked' | 'claimed' }
    | {
          status: 'approved';
          target: PairingTarget;
          approver: { name?: string };
          session?: UserTokenView;
      };

/** `PairingListItem` — one row of `GET /pairings`. */
export interface PairingListItem {
    pairingId: string;
    purpose: PairingPurpose;
    client: PairingClient;
    target: PairingTarget;
    status: PairingStatus;
    approvedAt?: number;
    claimedAt?: number;
}

/** `PairingListView` — the pairings this account approved, the latest 50. */
export interface PairingListView {
    list: PairingListItem[];
}
