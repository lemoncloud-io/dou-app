import { sessionAuthAdapter } from '../session/sessionAuthAdapter';
import { alignSessionSite, alignStoredSessionSite } from './alignSessionSite';
import { createReauthDelegate } from './reauthDelegate';
import { credentialRenewers } from './renewers';

import type { SocketSessionDelegate } from './types';

export const createSocketSessionDelegate = (): SocketSessionDelegate => ({
    ...createReauthDelegate(),
    commitRefreshedToken: async (slot, view) => {
        await sessionAuthAdapter.commitRefreshedToken(
            slot,
            view as Parameters<typeof sessionAuthAdapter.commitRefreshedToken>[1]
        );
        void alignSessionSite(slot, (view as { $site?: { id?: string } } | null)?.$site?.id);
    },
    onAuthExpired: slot => credentialRenewers.forSlot(slot).onTerminalExpiry(),
    onAuthenticated: slot => alignStoredSessionSite(slot),
});
