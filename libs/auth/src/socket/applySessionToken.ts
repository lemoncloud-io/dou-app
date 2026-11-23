import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';
import { relaySession } from '../session/relaySession';

import { getSocketManager, RELAY_SLOT } from '@chatic/transport';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { createReauthDelegate } from './reauthDelegate';

const DEFAULT_APPLY_TIMEOUT_MS = 10_000;

export interface ApplySessionTokenOptions {
    timeoutMs?: number;
}

type SessionTokenView = UserTokenView & { $auth?: { id?: string } };

export const applySessionToken = async ($token: unknown, options?: ApplySessionTokenOptions): Promise<void> => {
    const view = ($token ?? null) as SessionTokenView | null;
    const identityToken = view?.Token?.identityToken;
    if (!identityToken) {
        return;
    }
    if (!view?.$auth?.id) {
        throw new Error('[applySessionToken] $token.$auth.id missing — cannot re-register the relay socket');
    }

    await relaySession.loginByToken(view);

    const manager = getSocketManager();
    await reauthenticateActiveSocket({ manager, delegate: createReauthDelegate(), slot: RELAY_SLOT });

    const auth = manager.getClient(RELAY_SLOT)?.auth;
    if (!auth) {
        logger.info('SOCKET', '[applySessionToken] no relay slot bound — token committed, socket applies on boot');
        return;
    }

    await waitUntilAuthenticated(auth, options?.timeoutMs ?? DEFAULT_APPLY_TIMEOUT_MS);

    if (auth.token !== identityToken) {
        throw new Error('[applySessionToken] relay socket did not adopt the new identity');
    }
};

const waitUntilAuthenticated = async (auth: { ready(): Promise<void> }, timeoutMs: number): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`[applySessionToken] relay re-auth not confirmed within ${timeoutMs}ms`)),
            timeoutMs
        );
    });
    try {
        await Promise.race([auth.ready(), deadline]);
    } finally {
        clearTimeout(timer);
    }
};
