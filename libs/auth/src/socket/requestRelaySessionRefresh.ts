import { logger } from '@chatic/logger';

import { Coalescer } from '../utils/coalescer';
import { canRefreshThroughSocket, getAuthSnapshot } from './authStatus';
import { getSocketManager, RELAY_SLOT } from '@chatic/transport';
import type { ISocketManager } from '@chatic/transport';

const RESULT_MEMO_MS = 3_000;

const coalescer = new Coalescer<boolean>({ memoMs: RESULT_MEMO_MS });

let lastVerdictHandshaking = false;

export interface RequestRelaySessionRefreshDeps {
    manager?: ISocketManager;
}

export const resetRelayRefreshCoalescing = (): void => {
    coalescer.reset();
    lastVerdictHandshaking = false;
};

class RelayRefreshAttempt {
    constructor(private readonly deps: RequestRelaySessionRefreshDeps) {}

    async run(): Promise<boolean> {
        const manager = this.deps.manager ?? getSocketManager();

        const snapshot = getAuthSnapshot(RELAY_SLOT, { manager });
        lastVerdictHandshaking = snapshot.status === 'handshaking';
        if (!canRefreshThroughSocket(snapshot.status)) {
            logger.warn('SOCKET', '[requestRelaySessionRefresh] relay cannot carry a refresh right now', {
                data: {
                    status: snapshot.status,
                    transport: snapshot.transport,
                    controller: snapshot.controller,
                },
            });
            return false;
        }

        const auth = manager.getClient(RELAY_SLOT)?.auth;
        if (!auth) return false;

        try {
            await auth.refresh();
            return true;
        } catch (error) {
            logger.warn('SOCKET', '[requestRelaySessionRefresh] relay socket refresh failed', { error });
            return false;
        }
    }
}

export const requestRelaySessionRefresh = (deps: RequestRelaySessionRefreshDeps = {}): Promise<boolean> => {
    if (lastVerdictHandshaking && (deps.manager ?? getSocketManager()).isSlotVerified(RELAY_SLOT)) {
        coalescer.forgetResult();
    }
    return coalescer.run(() => new RelayRefreshAttempt(deps).run());
};
