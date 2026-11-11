import { RELAY_CLOUD_ID } from '@chatic/data';
import { credentialFreshness, relayStore } from '@chatic/session';

import type { IRelayCredentialProbe } from './types';

/**
 * Two read-only questions about the relay session, answered from the session itself.
 *
 * They used to be asked of lemon-web-core's own token store, which kept a second copy of the relay
 * credential with a clock of its own. lemon now holds its credentials in memory only, rebuilt from the
 * relay token at boot, so the session is the one place left to ask.
 */
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
