import { logger } from '@chatic/logger';
import { relaySession, type LogoutOptions } from '../session/relaySession';

import { getSocketManager, kindOf } from '@chatic/transport';
import type { ISocketManager, SlotKey } from '@chatic/transport';

export const notifySocketLogout = (slot: SlotKey, manager: ISocketManager = getSocketManager()): void => {
    const auth = manager.getClient(slot)?.auth;
    if (!auth) return;
    void Promise.resolve(auth.logout()).catch(error =>
        logger.warn('SOCKET', '[logoutSession] socket auth.logout failed (local teardown already proceeded)', {
            error,
            data: { kind: kindOf(slot), cid: slot },
        })
    );
};

export const logoutSession = async (options?: LogoutOptions): Promise<void> => {
    for (const slot of getSocketManager().getSlotKeys()) notifySocketLogout(slot);

    await relaySession.clearAndRedirect(options);
};
