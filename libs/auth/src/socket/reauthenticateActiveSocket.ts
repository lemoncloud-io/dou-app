import { logger } from '@chatic/logger';

import { authIdRegistry } from './authIdRegistry';

import type { AuthActivationGate } from './bootstrapSocketConnection';
import type { ISocketManager, SlotKey } from '@chatic/transport';
import type { ReauthDelegate } from './types';

export interface ReauthenticateActiveSocketArgs {
    manager: ISocketManager;
    delegate: ReauthDelegate;
    slot: SlotKey;
}

export const reauthenticateActiveSocket = async ({
    manager,
    delegate,
    slot,
}: ReauthenticateActiveSocketArgs): Promise<void> => {
    const client = manager.getClient(slot);
    const auth = client?.auth;
    if (!auth) {
        return;
    }

    const registration = await delegate.getAuthRegistration(slot);
    if (!registration) {
        return;
    }

    const sign = (token: string, ctx?: { target?: string }) => delegate.signAuth(slot, token, ctx?.target);

    const closeGateIfDisconnected = (): void => {
        if (client && client.state !== 'connected') {
            (auth as unknown as AuthActivationGate).stop();
        }
    };

    if (registration.token === auth.token) {
        if (authIdRegistry.resync(slot, auth, registration, sign)) {
            closeGateIfDisconnected();
        }
        return;
    }

    logger.info('SOCKET', '[reauthenticateActiveSocket] identity changed, re-authenticating', { data: { cid: slot } });

    const wasVerified = manager.isSlotVerified(slot);
    if (wasVerified) {
        void Promise.resolve(auth.logout()).catch(() => undefined);
    }

    if (wasVerified) {
        manager.setAuthenticated(slot, false);
    }

    auth.register({ token: registration.token, authId: registration.authId, sign });
    authIdRegistry.record(slot, registration.authId);

    closeGateIfDisconnected();
};
