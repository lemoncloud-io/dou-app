import { useCallback, useEffect } from 'react';

import { logger } from '@chatic/bridges';

import { credentialFreshness } from '../../auth/credentialFreshness';
import { renewCloudSession } from '../../../socket/auth/renewCloudSession';

/**
 * Keeps the ACTIVE cloud's SOCKET session alive — the cloud counterpart of
 * `useSessionStalenessGuard`, and deliberately a separate hook because the two servers recover
 * differently:
 *
 * | | relay | cloud |
 * | --- | --- | --- |
 * | 갱신 수단 | refresh (`ClientSocketAuth` 단독) | **재발급** (`delegate-cloud` + `exchange-token`) |
 * | 소켓 없으면 | 갱신 불가 — 기다리는 것 말고 없다 | relay만 살아 있으면 가능 |
 * | 만료 시 정책 | 세션 자체가 위험 → teardown 후보 | 클라우드만 버리면 됨 (`onAuthExpired`) |
 *
 * Folding cloud into the relay guard would mean one hook with two unrelated recovery strategies and a
 * `kind` parameter that changes everything it does — so the guards are split the same way the tokens
 * are.
 *
 * **What this actually protects, and what it does not.** It used to be described as keeping the
 * cloud's HTTP *signing* credential alive. That is no longer true and never really was after
 * ADR-0070: nothing signs with the cloud credential, because the one request that did — the cloud
 * HTTP refresh — was deleted, and requests bound for a cloud host (`exchange-token`, invite lookups)
 * are signed the RELAY way. What is at stake is the cloud SOCKET's token: `renewCloudSession`
 * re-issues it AND re-registers the socket, and skipping that leaves the SDK resending an expired
 * token until `onAuthExpired` drops the user out of the cloud.
 *
 * The credential's `Expiration` is still the right clock — not because it signs anything, but because
 * it is minted with the cloud token and expires alongside it, which makes it a measurable proxy for
 * the token's age (`CredentialOwner` in `credentialFreshness` says the same).
 *
 * Trigger is a self-arming deadline, not a poll: that `Expiration` says exactly when to act, so the
 * hook sleeps until `Expiration - margin` (bounded, see below) instead of asking every N seconds.
 * `check` is returned for hosts with a trigger this hook cannot know about — apps/web fires it on
 * WebView foreground, where a suspended tab's timer fires late or not at all.
 */
export interface CloudCredentialPolicy {
    /** Off by default is wrong for a guard — callers opt out explicitly. */
    enabled?: boolean;
    /** Renew once the credential has this little life left. */
    marginMs?: number;
    /** Re-check when the tab becomes visible. A suspended tab does not fire its timers on time. */
    checkOnVisible?: boolean;
}

/**
 * One SDK refresh cycle (`AUTH_OPTIONS.refreshIntervalMs`, 5 min — the server does not report
 * `expiresIn`). A healthy cloud socket re-mints the credential every cycle, so a credential that has
 * dropped below this margin is ITSELF the evidence that the socket is not keeping up. That makes the
 * margin a socket-health probe we get for free rather than a number to tune, and it keeps the renewal
 * from competing with a refresh that was about to land anyway.
 */
const DEFAULT_MARGIN_MS = 5 * 60_000;

/**
 * Ceiling on a single sleep. A credential minted an hour out would otherwise park one long timer, and
 * a long timer is exactly what a suspended/throttled tab fires late — this way the deadline is
 * re-derived from the store at least this often, which also picks up a cloud entered (or left) while
 * this host stayed mounted. The tick itself is a store read and a subtraction; no I/O.
 */
const MAX_SLEEP_MS = 5 * 60_000;
/** Floor, so a lapsed-but-unrenewable credential cannot spin the timer. */
const MIN_SLEEP_MS = 1_000;
/** Sleep after a renewal that did not happen (offline, relay stale, exchange rejected). */
const RETRY_SLEEP_MS = 60_000;

const clampSleep = (ms: number): number => Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, ms));

export const useCloudCredentialGuard = (policy: CloudCredentialPolicy = {}): { check: () => Promise<void> } => {
    const { enabled = true, marginMs = DEFAULT_MARGIN_MS, checkOnVisible = true } = policy;

    /** Evaluates the deadline, renews if it has arrived, and reports how long to sleep next. */
    const evaluate = useCallback(async (): Promise<number> => {
        const remaining = credentialFreshness.timeToExpiry('cloud');
        if (remaining == null) {
            // No cloud session, or a token view with no credential to measure — nothing to renew.
            return MAX_SLEEP_MS;
        }
        if (remaining > marginMs) {
            return clampSleep(remaining - marginMs);
        }
        if (!navigator.onLine) {
            // The exchange would only fail; the credential is no more expired for having waited.
            return RETRY_SLEEP_MS;
        }

        if (!(await renewCloudSession())) {
            // Not a teardown signal: cloud loss is recoverable by re-entry, and `onAuthExpired`
            // already owns the "give up on this cloud" decision.
            logger.warn('SESSION', '[cloudCredentialGuard] cloud credential renewal did not run');
            return RETRY_SLEEP_MS;
        }

        // Re-derive from the token we just wrote rather than assuming a full lifetime.
        const renewed = credentialFreshness.timeToExpiry('cloud');
        return renewed != null && renewed > marginMs ? clampSleep(renewed - marginMs) : RETRY_SLEEP_MS;
    }, [marginMs]);

    const check = useCallback(async (): Promise<void> => {
        await evaluate();
    }, [evaluate]);

    useEffect(() => {
        if (!enabled) {
            return;
        }
        let cancelled = false;
        let handle: ReturnType<typeof setTimeout> | undefined;

        const tick = async (): Promise<void> => {
            const sleepMs = await evaluate();
            if (cancelled) {
                return;
            }
            handle = setTimeout(() => void tick(), sleepMs);
        };
        void tick();

        return () => {
            cancelled = true;
            if (handle) {
                clearTimeout(handle);
            }
        };
    }, [enabled, evaluate]);

    useEffect(() => {
        if (!enabled || !checkOnVisible) {
            return;
        }
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'visible') void check();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [enabled, checkOnVisible, check]);

    return { check };
};
