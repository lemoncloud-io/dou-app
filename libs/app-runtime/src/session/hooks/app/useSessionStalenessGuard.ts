import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import { hasStoredRelaySession, isStoredSessionExpired } from '../../../http/transport';

import { useKindVerified } from '../../../runtime/useKindVerified';
import { requestRelaySessionRefresh } from '../../../socket/auth/requestRelaySessionRefresh';
import { credentialFreshness } from '../../auth/credentialFreshness';

/**
 * Keeps the relay HTTP signing credentials fresh, as one hook instead of two app-local copies.
 *
 * The AWS credentials minted from the relay token expire on the order of an hour. The socket auth
 * loop re-mints them through its refresh writeback only while its socket is healthy — after laptop
 * sleep or a dropped socket nothing refreshes them, so every signed request 403s while
 * `isAuthenticated` stays true (that flag is session EXISTENCE, not credential validity).
 *
 * apps/web and admin-v2 each invented this independently
 * (`useRelayCredentialRefresh` · `useRelaySessionGuard`); desktop-web now has one too
 * (`app/runtime/useRelayCredentialRefresh`, added when a cloud switch surfaced as a bare
 * `Network Error`), and testbed still has none. The probe body was identical in every case; only the
 * policy differed, so policy is what this takes as options (ADR-0070 3단계 체크리스트 7).
 *
 * **RELAY ONLY, by design — do not add a cloud branch here.** The name says "session", but every
 * probe below reads relay storage and the refresh goes to the relay socket, because relay and cloud
 * recover by different means: relay can only be REFRESHED (its token has no parent to be minted
 * from), while a cloud token is re-issued from the relay identity whenever it lapses. The cloud
 * counterpart is `useCloudCredentialGuard`, which re-issues instead of refreshing; the reasoning
 * lives in `session/auth/cloudTokens`. Adding a `kind` option here would put two unrelated recovery
 * strategies behind one switch — and inventing a second relay guard in an app is what this hook was
 * created to stop (admin-v2 had one).
 *
 * Two properties are NOT configurable, because they are the reason the guard exists:
 *  - **The probe never refreshes.** `isStoredSessionExpired` is a read-only storage check. The
 *    tempting `webTransport.isAuthenticated()` fires lemon-web-core's own HTTP refresh — a second
 *    refresh engine that updates only the lemon store and leaves the socket's signing material
 *    stale, which is the signature-error divergence this whole ADR is unwinding.
 *  - **Refresh goes through `requestRelaySessionRefresh`.** That is the single entry point that prefers
 *    the socket AuthController (the owner, ADR-0070 불변조건 1) over any direct HTTP call.
 */
export interface SessionStalenessPolicy {
    /** Off by default is wrong for a guard — callers opt out explicitly (e.g. before login). */
    enabled?: boolean;
    /** Polling cadence. `null` disables the interval (edge-driven callers). */
    intervalMs?: number | null;
    /** Re-check when the tab becomes visible — the main wake-from-sleep moment for a desktop app. */
    checkOnVisible?: boolean;
    /**
     * Re-check on the rising edge of relay socket verification. This is when the socket path becomes
     * available, and also when a returning user is most likely carrying an expired credential.
     * Prefer this over an interval where a socket exists: `requestRelaySessionRefresh` can only reach the
     * refresh OWNER when a live authenticated socket is there.
     */
    checkOnRelayVerified?: boolean;
    /**
     * Whether "no stored session at all" counts toward the teardown streak. A console that requires
     * a real login wants `true` (an evaporated session must land on the login screen); an app where
     * logout is manual-only wants `false`.
     */
    missingSessionCountsAsFailure?: boolean;
    /**
     * Consecutive definitive failures before `onTeardown` runs. `null` never tears down. Repeated
     * rather than single failure on purpose: one transient blip is indistinguishable from a dead
     * session, and logging a user out over a blip is worse than a few more ticks of 403s.
     */
    consecutiveFailureLimit?: number | null;
    /** Ran after `consecutiveFailureLimit` definitive failures. Omit to never tear down. */
    onTeardown?: () => Promise<void> | void;
    /**
     * Refresh ahead of the stored-session expiry horizon when the CREDENTIAL is running out.
     *
     * `isStoredSessionExpired` alone leaves a real hole at boot: the socket handshake's `auth.update`
     * reply carries no token (the SDK only emits one from `refresh`/`switch`), so the first writeback
     * lands one refresh cycle after connect — 5 minutes with `AUTH_OPTIONS.refreshIntervalMs`, because
     * the server does not report `expiresIn` yet. Until then relay-signed HTTP runs on whatever the
     * store had, which is exactly the credential that 403s after a long sleep.
     *
     * **It asks the credential now, instead of refreshing blind.** This used to fire on every edge
     * regardless — the stored probe reads lemon's `expired_time`, which the two clocks make unreliable
     * (a refresh that updated the token but carried no credential leaves it fresh while the signing
     * material is dead), so the hole was papered over by never trusting it. The better clock was
     * already in the repo: `credentialFreshness` reads the relay credential's own `Expiration`, the
     * thing that actually signs. Measuring it closes the same hole and stays quiet the rest of the
     * time — a credential minted minutes ago is not refreshed just because the tab came back.
     * Unmeasurable (no credential on the token view) keeps the old blind behavior: that is the one
     * case where there is nothing to read and guessing low is the safe direction.
     *
     * Meant for EDGE-driven callers (relay verified, foreground return), never for an interval — an
     * interval with this on is a refresh every tick in the window where it does fire. Throttled to
     * `FORCE_REFRESH_COOLDOWN_MS` regardless, and a preemptive refresh that fails is deliberately NOT
     * counted toward the teardown streak: a credential that is still valid says nothing about session
     * health.
     */
    forceRefresh?: boolean;
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Floor between two `forceRefresh` runs. Foreground returns can arrive seconds apart (a user
 * bouncing between apps), and each forced refresh is a real socket round trip whose failures also
 * feed the SDK's own `maxFailures` counter — so this is a storm guard, not a nicety.
 */
const FORCE_REFRESH_COOLDOWN_MS = 60_000;

/**
 * Preempt once the relay credential has this little life left.
 *
 * One SDK refresh cycle (`AUTH_OPTIONS.refreshIntervalMs`, 5 min — the server does not report
 * `expiresIn`), which is the same reasoning `useCloudCredentialGuard` uses for its margin: a healthy
 * socket re-mints the credential every cycle, so anything with more than a cycle left will be
 * refreshed by the owner before it lapses and needs no help. Below it, the socket is demonstrably not
 * keeping up — which is exactly the boot window and the wake-from-sleep case.
 */
const PREEMPTIVE_MARGIN_MS = 5 * 60_000;

/**
 * Returns `check`, so a host can add a trigger this hook cannot know about — apps/web fires it on
 * WebView foreground, which is a bridge concept.
 */
export const useSessionStalenessGuard = (policy: SessionStalenessPolicy = {}): { check: () => Promise<void> } => {
    const {
        enabled = true,
        intervalMs = DEFAULT_INTERVAL_MS,
        checkOnVisible = false,
        checkOnRelayVerified = false,
        missingSessionCountsAsFailure = false,
        consecutiveFailureLimit = null,
        onTeardown,
        forceRefresh = false,
    } = policy;

    const inFlight = useRef(false);
    const failureStreak = useRef(0);
    /** Last `forceRefresh` run, for the cooldown above. 0 = never, so the first trigger always runs. */
    const lastForcedAt = useRef(0);
    // Read through a ref so a caller passing an inline arrow does not re-arm the interval each render.
    const teardownRef = useRef(onTeardown);
    teardownRef.current = onTeardown;

    const check = useCallback(async (): Promise<void> => {
        // Offline refreshes always fail; skip rather than burn a request — or a teardown — on a dead link.
        if (inFlight.current || !navigator.onLine) return;
        inFlight.current = true;

        const registerFailure = async (): Promise<void> => {
            failureStreak.current += 1;
            if (consecutiveFailureLimit != null && failureStreak.current >= consecutiveFailureLimit) {
                failureStreak.current = 0;
                await teardownRef.current?.();
            }
        };

        try {
            if (!(await hasStoredRelaySession())) {
                if (missingSessionCountsAsFailure) await registerFailure();
                return;
            }
            const expired = await isStoredSessionExpired();
            // Steady state while the socket writeback keeps the store ahead of expiry — unless the
            // caller opted into a preemptive refresh, which the cooldown keeps to one per minute.
            const now = Date.now();
            // `null` = nothing to measure (no credential on the token view) → treat as needing one,
            // which is the pre-measurement behavior and the safe direction when blind.
            const remaining = credentialFreshness.timeToExpiry('relay', now);
            const credentialRunningOut = remaining == null || remaining <= PREEMPTIVE_MARGIN_MS;
            const preemptive =
                !expired &&
                forceRefresh &&
                credentialRunningOut &&
                now - lastForcedAt.current >= FORCE_REFRESH_COOLDOWN_MS;
            if (!expired && !preemptive) {
                failureStreak.current = 0;
                return;
            }
            // Stamp before the await: two triggers racing (verified edge + foreground) must not both
            // get through, and `inFlight` alone does not cover the second one arriving after this
            // one resolves.
            if (preemptive) lastForcedAt.current = now;

            if (await requestRelaySessionRefresh()) {
                failureStreak.current = 0;
                return;
            }

            if (!expired) {
                // A preemptive refresh that did not run is not evidence of a dead session — the
                // socket may simply not be authenticated yet. Counting it would tear down a session
                // whose credentials are still perfectly valid.
                logger.warn('SESSION', '[stalenessGuard] preemptive relay refresh did not run');
                return;
            }
            logger.warn('SESSION', '[stalenessGuard] stale relay credentials not refreshed');
            await registerFailure();
        } catch (error) {
            // Transient (storage race, refresh rejection) — the next trigger retries. Deliberately
            // NOT a failure: an exception here says nothing about whether the session is dead.
            logger.warn('SESSION', '[stalenessGuard] credential probe failed', { error });
        } finally {
            inFlight.current = false;
        }
    }, [consecutiveFailureLimit, missingSessionCountsAsFailure, forceRefresh]);

    useEffect(() => {
        if (!enabled || intervalMs == null) return;
        const id = setInterval(() => void check(), intervalMs);
        return () => clearInterval(id);
    }, [enabled, intervalMs, check]);

    useEffect(() => {
        if (!enabled || !checkOnVisible) return;
        const onVisibilityChange = (): void => {
            if (document.visibilityState === 'visible') void check();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    }, [enabled, checkOnVisible, check]);

    const isRelayVerified = useKindVerified('relay');
    const prevVerified = useRef(false);
    useEffect(() => {
        const becameVerified = !prevVerified.current && isRelayVerified;
        prevVerified.current = isRelayVerified;
        if (enabled && checkOnRelayVerified && becameVerified) void check();
    }, [enabled, checkOnRelayVerified, isRelayVerified, check]);

    return { check };
};
