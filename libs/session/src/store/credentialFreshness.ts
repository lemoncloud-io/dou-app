import { RELAY_CLOUD_ID } from '@chatic/data';

import { msUntilExpiration } from './expiry';
import { cloudStore, relayStore } from './stores';

export interface ICredentialFreshness {
    timeToExpiry(cid: string, now?: number): number | null;
    isStale(cid: string, now?: number): boolean;
}

class CredentialFreshness implements ICredentialFreshness {
    timeToExpiry(cid: string, now: number = Date.now()): number | null {
        const token = cid === RELAY_CLOUD_ID ? relayStore.getRelayToken() : cloudStore.getCloudTokenOf(cid);
        return msUntilExpiration(token?.Token?.credential?.Expiration, now);
    }

    isStale(cid: string, now: number = Date.now()): boolean {
        const remaining = this.timeToExpiry(cid, now);
        return remaining != null && remaining <= 0;
    }
}

export const credentialFreshness: ICredentialFreshness = new CredentialFreshness();
