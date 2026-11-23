import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

export type PairingStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';

export type PairingPurpose = 'web' | 'debug';

export type PairingTargetType = 'relay' | 'cloud';

export interface PairingClient {
    name?: string;
    platform?: string;
    userAgent?: string;
}

export interface PairingTarget {
    type: PairingTargetType;
    cloudId?: string;
}

export interface PairingRequestBody {
    purpose: PairingPurpose;
    deviceId: string;
    client?: { name?: string; platform?: string };
}

export interface PairingRequestView {
    pairingId: string;
    code: string;
    expiredAt: number;
    interval: number;
}

export interface PairingCheckBody {
    code: string;
}

export interface PairingCheckView {
    pairingId: string;
    purpose: PairingPurpose;
    deviceId: string;
    client: PairingClient;
    expiredAt: number;
}

export interface PairingApproveBody {
    target: PairingTarget;
}

export interface PairingDecisionView {
    pairingId: string;
    status: PairingStatus;
}

export type PairingClaimView =
    | { status: 'pending' | 'expired' | 'denied' | 'revoked' | 'claimed' }
    | {
          status: 'approved';
          target: PairingTarget;
          approver: { name?: string };
          session?: UserTokenView;
      };

export interface PairingListItem {
    pairingId: string;
    purpose: PairingPurpose;
    client: PairingClient;
    target: PairingTarget;
    status: PairingStatus;
    approvedAt?: number;
    claimedAt?: number;
}

export interface PairingListView {
    list: PairingListItem[];
}
