import { RELAY_CLOUD_ID } from '@chatic/data';
import { credentialFreshness, relayStore } from '@chatic/session';

import type { IRelayCredentialProbe } from './types';

class RelayCredentialProbe implements IRelayCredentialProbe {
    hasSession(): boolean {
        return !!relayStore.getRelayToken()?.Token;
    }

    isCredentialExpired(now: number = Date.now()): boolean {
        const remaining = credentialFreshness.timeToExpiry(RELAY_CLOUD_ID, now);
        return remaining == null || remaining <= 0;
    }
}

export const relayCredentialProbe: IRelayCredentialProbe = new RelayCredentialProbe();
