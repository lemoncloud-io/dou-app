import type { RuntimeWireValue } from '@chatic/bridge-messages';
import { webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { logger } from '@chatic/logger';
import {
    RUNTIME_CONTRACTS,
    RUNTIME_CONTRACT_MISMATCH_CODE,
    offerHoldsSession,
    readRuntimeOffer,
    settleRuntimeHello,
} from '@chatic/runtime-core';
import type { RuntimeHelloOutcome, RuntimeMirrorPort } from '@chatic/runtime-core';

import { webMirrorPort } from './createBridgedRuntime';

export const SESSION_OWNER_GIVE_UP_MS = 30_000;

export const SESSION_OWNER_HELLO_TIMEOUT_MS = 10_000;

export const SESSION_OWNER_LAST_HELLO_MIN_MS = 1_000;

const RETRY_DELAYS_MS = [250, 500, 1_000, 2_000] as const;

export type SessionOwnerChoice =
    | { sessionOwner: 'web' }
    | {
          sessionOwner: 'native';
          contract: number;
          hello: { seq: number; session: RuntimeWireValue };
          port: RuntimeMirrorPort;
      }
    | { sessionOwner: null; attempts: number; lastFailure: string };

export interface SessionOwnerOptions {
    offer: unknown;
    disabled?: boolean;
    client?: IWebBridgeClient;
    giveUpAfterMs?: number;
    now?: () => number;
    wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

export const visibleClock = (): (() => number) => {
    if (typeof document === 'undefined') return Date.now;
    let shown = 0;
    let shownSince: number | null = document.visibilityState === 'hidden' ? null : Date.now();
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            if (shownSince !== null) shown += Date.now() - shownSince;
            shownSince = null;
        } else if (shownSince === null) {
            shownSince = Date.now();
        }
    });
    return () => shown + (shownSince === null ? 0 : Date.now() - shownSince);
};

export const settleSessionOwner = async ({
    offer,
    disabled = false,
    client = webClient,
    giveUpAfterMs = SESSION_OWNER_GIVE_UP_MS,
    now,
    wait = defaultWait,
}: SessionOwnerOptions): Promise<SessionOwnerChoice> => {
    const sharesContract = readRuntimeOffer(offer) !== null;
    if (disabled || !sharesContract) {
        if (!offerHoldsSession(offer)) return { sessionOwner: 'web' };
        logger.info('session.owner_held_asked', 'the shell holds the session in this process; asking anyway', {
            data: { disabled, sharesContract },
        });
    }
    const clock = now ?? visibleClock();

    const port = webMirrorPort(client);
    const startedAt = clock();
    for (let attempt = 1; ; attempt++) {
        const left = giveUpAfterMs - (clock() - startedAt);
        const timeoutMs = Math.min(SESSION_OWNER_HELLO_TIMEOUT_MS, Math.max(left, SESSION_OWNER_LAST_HELLO_MIN_MS));
        const outcome: RuntimeHelloOutcome = await client
            .request({ type: 'RuntimeHello', data: { contracts: [...RUNTIME_CONTRACTS] } }, { timeoutMs })
            .then(
                response => ({ answer: response.data }),
                (error: unknown) => ({ failure: { code: failureCode(error) } })
            );
        const settled = settleRuntimeHello(outcome);
        if (settled.sessionOwner === 'web') return { sessionOwner: 'web' };
        if (settled.sessionOwner === 'native') {
            const { contract, seq, session } = settled;
            if (attempt > 1) {
                logger.info('session.owner_settled_after_retry', 'the shell took the session after a retried hello', {
                    data: { attempt },
                });
            }
            return { sessionOwner: 'native', contract, hello: { seq, session }, port };
        }

        const lastFailure = 'failure' in outcome ? outcome.failure.code : 'UNREADABLE_ANSWER';
        const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
        if (lastFailure === RUNTIME_CONTRACT_MISMATCH_CODE || clock() - startedAt + delay > giveUpAfterMs) {
            logger.error('session.owner_unsettled', 'the shell offered the session but never settled who owns it', {
                data: { attempts: attempt, lastFailure },
            });
            return { sessionOwner: null, attempts: attempt, lastFailure };
        }
        logger.warn('session.owner_hello_unsettled', 'the hello settled nothing — asking again', {
            data: { attempt, lastFailure },
        });
        await wait(delay);
    }
};

const failureCode = (error: unknown): string => {
    const code = (error as { code?: unknown } | null | undefined)?.code;
    return typeof code === 'string' ? code : 'ERROR';
};
