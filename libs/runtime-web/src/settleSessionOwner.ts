import type { RuntimeWireValue } from '@chatic/bridge-messages';
import { webClient } from '@chatic/bridges';
import type { IWebBridgeClient } from '@chatic/bridges';
import { logger } from '@chatic/logger';
import {
    RUNTIME_CONTRACTS,
    RUNTIME_CONTRACT_MISMATCH_CODE,
    readRuntimeOffer,
    settleRuntimeHello,
} from '@chatic/runtime-core';
import type { RuntimeHelloOutcome, RuntimeMirrorPort } from '@chatic/runtime-core';

import { webMirrorPort } from './createBridgedRuntime';

/**
 * How long the page keeps asking a shell that offered to own the session before it gives up, counted
 * only while the page is shown. The shell answers once its runtime has started, which is well under a
 * second on a healthy launch; this only bounds a launch where it never does, so the person sees a
 * screen that says so instead of the boot cover forever. No hello outlasts it: the last one waits only
 * for what is left (`SESSION_OWNER_LAST_HELLO_MIN_MS` at the least).
 */
export const SESSION_OWNER_GIVE_UP_MS = 30_000;

/**
 * One hello's wait. The shell holds a hello for up to five seconds while its runtime starts and then
 * answers that it is still starting, so this only catches an answer that never comes.
 */
export const SESSION_OWNER_HELLO_TIMEOUT_MS = 10_000;

/** The shortest wait a hello is given, even when less than that is left of the limit. */
export const SESSION_OWNER_LAST_HELLO_MIN_MS = 1_000;

/** The pause before each ask after the first; the last one repeats. */
const RETRY_DELAYS_MS = [250, 500, 1_000, 2_000] as const;

/** How the page runs this launch, as settled before it boots. */
export type SessionOwnerChoice =
    /** The page owns the session and boots its own runtime, as in a browser. */
    | { sessionOwner: 'web' }
    /** The shell owns it: the page mirrors the shell's runtime from `hello` over `port`. */
    | {
          sessionOwner: 'native';
          contract: number;
          hello: { seq: number; session: RuntimeWireValue };
          port: RuntimeMirrorPort;
      }
    /**
     * Not settled, after asking for `SESSION_OWNER_GIVE_UP_MS` — or at once when the shell holds the
     * session under a contract this page does not speak (`RUNTIME_CONTRACT_MISMATCH`), which asking
     * again cannot change. The page boots neither runtime: the shell may hold the session, and a page
     * that ran its own then would be a second owner.
     */
    | { sessionOwner: null; attempts: number; lastFailure: string };

export interface SessionOwnerOptions {
    /** What the shell injected before the page ran (`window.CHATIC_APP_RUNTIME`), read as untrusted. */
    offer: unknown;
    /**
     * The page's own setting that it does not ask. With it set, a launch is the page's: a shell that
     * offered waits for a hello that never comes and keeps its runtime off. The offer does not say
     * whether the shell already holds the session, so this is safe only from a fresh app process — a
     * page reloaded into one whose shell answered `native` earlier would boot a second session.
     */
    disabled?: boolean;
    client?: IWebBridgeClient;
    giveUpAfterMs?: number;
    /** Test seams. `now` is the clock the limit is counted on: by default it runs only while the page is shown. */
    now?: () => number;
    wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A clock that runs only while the page is shown. The bridge's own timeouts pause while the page is
 * hidden, and a launch sent to the background while it asks — or one waiting for a device's first
 * unlock — has not been failing for the time it spent away. Without a document it is the wall clock.
 */
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

/**
 * Settles who owns the session this launch, before the page boots a runtime.
 *
 * No offer (a browser, a shell that does not run its runtime, an offer in none of the page's
 * contracts) or the page's own setting → `web`, at once and without a word to the shell. Otherwise the
 * page makes the mirror's port — before the hello, so a session push in between is kept — and asks.
 * `web` and `native` answers settle it; anything else (a timeout, a shell still starting, an answer
 * that does not read) is asked again, with a growing pause, until `giveUpAfterMs` has passed.
 */
export const settleSessionOwner = async ({
    offer,
    disabled = false,
    client = webClient,
    giveUpAfterMs = SESSION_OWNER_GIVE_UP_MS,
    now,
    wait = defaultWait,
}: SessionOwnerOptions): Promise<SessionOwnerChoice> => {
    if (disabled || !readRuntimeOffer(offer)) return { sessionOwner: 'web' };
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
