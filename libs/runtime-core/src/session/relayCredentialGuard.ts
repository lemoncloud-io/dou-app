import { logger } from '@chatic/logger';
import { RELAY_SLOT, SDK_REFRESH_CYCLE_MS, getSocketManager, isLinkKnownDown } from '@chatic/transport';

import {
    canRefreshThroughSocket,
    getAuthStatus,
    credentialRenewers,
    Coalescer,
    relayCredentialProbe,
    Throttle,
} from '@chatic/auth';

import { foregroundPlatform } from './foreground';

/**
 * Keeps the relay HTTP signing credentials fresh, as one guard instead of three app-local copies.
 *
 * The AWS credentials minted from the relay token expire on the order of an hour. The socket auth
 * loop re-mints them through its refresh writeback only while its socket is healthy — after laptop
 * sleep or a dropped socket nothing refreshes them, so every signed request 403s while
 * `isAuthenticated` stays true (that flag is session EXISTENCE, not credential validity).
 *
 * apps/web and admin each invented this independently
 * (`useRelayCredentialRefresh` · `useRelaySessionGuard`); desktop-web now has one too
 * (`app/runtime/useRelayCredentialRefresh`, added when a cloud switch surfaced as a bare
 * `Network Error`). The probe body was identical in every case; only the
 * policy differed, so policy is what this takes as options. React reaches it through
 * `runtime.session.useSessionStalenessGuard`, which only starts and stops it.
 *
 * **RELAY ONLY, by design — do not add a cloud branch here.** The name says "session", but every
 * probe below reads relay storage and the refresh goes to the relay socket, because relay and cloud
 * recover by different means: relay can only be REFRESHED (its token has no parent to be minted
 * from), while a cloud token is re-issued from the relay identity whenever it lapses. The cloud
 * counterpart is `CloudCredentialGuard`, which re-issues instead of refreshing; the reasoning
 * lives in `@chatic/auth`'s `session/cloudTokens`. Adding a `kind` option here would put two unrelated recovery
 * strategies behind one switch — and inventing a second relay guard in an app is what this guard was
 * created to stop (admin had one).
 *
 * **It never ends a session.** A failed refresh is logged and retried on the next trigger. It used to
 * take a teardown policy — a failure streak and a callback — and no app used it any more: ending a
 * relay session belongs to the server's verdict and to the renewer's terminal-expiry window
 * (`credentialRenewers.relay`), which confirms an expiry before it logs anyone out. A probe that tore
 * sessions down on its own failures logged admins out of live sessions after a laptop sleep.
 *
 * Two properties are NOT configurable, because they are the reason the guard exists:
 *  - **The probe never refreshes.** `relayCredentialProbe` reads the session and nothing else. A
 *    probe that refreshed on its own would be a second refresh engine beside the socket's, which is
 *    the signature-error divergence this guard exists to prevent.
 *  - **Refresh goes through `requestRelaySessionRefresh`.** That is the single entry point that prefers
 *    the socket AuthController (the refresh's one owner) over any direct HTTP call.
 */
export interface SessionStalenessPolicy {
    /** Off by default is wrong for a guard — callers opt out explicitly (e.g. before login). */
    enabled?: boolean;
    /** Polling cadence. `null` disables the interval (edge-driven callers). */
    intervalMs?: number | null;
    /**
     * Re-check when the app returns to the foreground (`RuntimePorts.foreground`) — the main
     * wake-from-sleep moment for a desktop app.
     */
    checkOnVisible?: boolean;
    /**
     * Re-check on the rising edge of relay socket verification. This is when the socket path becomes
     * available, and also when a returning user is most likely carrying an expired credential.
     * Prefer this over an interval where a socket exists: `requestRelaySessionRefresh` can only reach the
     * refresh OWNER when a live authenticated socket is there.
     */
    checkOnRelayVerified?: boolean;
    /**
     * Refresh ahead of expiry when the CREDENTIAL is running out.
     *
     * The expiry check alone leaves a real hole at boot: the socket handshake's `auth.update`
     * reply carries no token (the SDK only emits one from `refresh`/`switch`), so the first writeback
     * lands one refresh cycle after connect — 5 minutes with `AUTH_OPTIONS.refreshIntervalMs`, because
     * the server does not report `expiresIn` yet. Until then relay-signed HTTP runs on whatever the
     * store had, which is exactly the credential that 403s after a long sleep.
     *
     * **It asks the credential now, instead of refreshing blind.** This used to fire on every edge
     * regardless — the expiry probe then read lemon's `expired_time`, a second clock that disagreed with
     * the credential's (a refresh that updated the token but carried no credential left it fresh while
     * the signing material was dead), so the hole was papered over by never trusting it. The better clock was
     * already in the repo: `credentialFreshness` reads the relay credential's own `Expiration`, the
     * thing that actually signs. Measuring it closes the same hole and stays quiet the rest of the
     * time — a credential minted minutes ago is not refreshed just because the tab came back.
     * Unmeasurable (no credential on the token view) keeps the old blind behavior: that is the one
     * case where there is nothing to read and guessing low is the safe direction.
     *
     * Meant for EDGE-driven callers (relay verified, foreground return), never for an interval — an
     * interval with this on is a refresh every tick in the window where it does fire. Throttled to
     * `FORCE_REFRESH_COOLDOWN_MS` regardless, and a preemptive refresh that fails is only logged at
     * warn: a credential that is still valid says nothing about session health.
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
 * One SDK refresh cycle (the server does not report `expiresIn`), which is the same reasoning
 * `CloudCredentialGuard` uses for its margin: a healthy socket re-mints the credential every
 * cycle, so anything with more than a cycle left will be refreshed by the owner before it lapses and
 * needs no help. Below it, the socket is demonstrably not keeping up — which is exactly the boot
 * window and the wake-from-sleep case.
 *
 * Read from the cadence itself rather than restated: see the transport's `socket/constants.ts`.
 */
const PREEMPTIVE_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

type ResolvedPolicy = Required<SessionStalenessPolicy>;

const resolve = (policy: SessionStalenessPolicy): ResolvedPolicy => ({
    enabled: policy.enabled ?? true,
    intervalMs: policy.intervalMs === undefined ? DEFAULT_INTERVAL_MS : policy.intervalMs,
    checkOnVisible: policy.checkOnVisible ?? false,
    checkOnRelayVerified: policy.checkOnRelayVerified ?? false,
    forceRefresh: policy.forceRefresh ?? false,
});

/**
 * The relay credential guard. `check()` probes once; `start()` arms the triggers the policy asks for
 * and returns their stop. `check` is also for a host with a trigger this guard cannot know about —
 * apps/web fires it on WebView foreground, which is a bridge concept.
 *
 * The probe's single flight, the preemptive refresh's floor and the last relay verification seen
 * belong to the guard, not to a start: a stop followed by a start (React StrictMode, a policy change)
 * keeps them, as the hook's refs kept them before.
 */
export class RelayCredentialGuard {
    // Concurrent triggers (interval + foreground + the verified edge) share one probe, and the
    // preemptive path keeps its own growing-free floor. FORCE_REFRESH_COOLDOWN_MS is the floor and the
    // first trigger always runs.
    private readonly probe = new Coalescer<void>();
    private readonly forceRefreshFloor = new Throttle({ intervalMs: FORCE_REFRESH_COOLDOWN_MS });
    private policy: ResolvedPolicy;
    /** The relay slot's verification as last seen, so a rising edge is told from a steady state. */
    private relayVerified = false;

    constructor(policy: SessionStalenessPolicy = {}) {
        this.policy = resolve(policy);
    }

    /** Replaces the policy. The probe reads it on its next run; triggers are re-armed by the next `start`. */
    setPolicy(policy: SessionStalenessPolicy): void {
        this.policy = resolve(policy);
    }

    check = async (): Promise<void> => {
        // Offline refreshes always fail; skip rather than burn a request on a dead link.
        if (isLinkKnownDown()) return;
        await this.probe.run(() => this.runProbe());
    };

    /** Arms the triggers the policy asks for; returns their stop. Arms nothing while disabled. */
    start(): () => void {
        const { enabled, intervalMs, checkOnVisible, checkOnRelayVerified } = this.policy;
        if (!enabled) return () => undefined;
        const stops: Array<() => void> = [];

        if (intervalMs != null) {
            const id = setInterval(() => void this.check(), intervalMs);
            stops.push(() => clearInterval(id));
        }

        if (checkOnVisible) {
            const foreground = foregroundPlatform.ports();
            stops.push(
                foreground.subscribe(() => {
                    if (foreground.read()) void this.check();
                })
            );
        }

        if (checkOnRelayVerified) {
            const manager = getSocketManager();
            const observe = (verified: boolean): void => {
                const becameVerified = !this.relayVerified && verified;
                this.relayVerified = verified;
                if (becameVerified) void this.check();
            };
            // The subscription reports the current state at once, so a socket already verified when the
            // guard starts is a rising edge too — unless an earlier start saw it.
            stops.push(manager.subscribeSlotVerified(RELAY_SLOT, observe));
        }

        return () => stops.forEach(stop => stop());
    }

    private async runProbe(): Promise<void> {
        const { forceRefresh } = this.policy;
        try {
            if (!relayCredentialProbe.hasSession()) return;
            // The relay credential's own clock — the only one; signed HTTP reads the same credential.
            // Nothing to measure counts as expired.
            const expired = relayCredentialProbe.isCredentialExpired();
            // Steady state while the socket writeback keeps the store ahead of expiry — unless the
            // caller opted into a preemptive refresh, which the cooldown keeps to one per minute.
            const now = Date.now();
            // `null` = nothing to measure (no credential on the token view) → treat as needing one,
            // which is the pre-measurement behavior and the safe direction when blind.
            const remaining = credentialRenewers.relay.timeToExpiry(now);
            const credentialRunningOut = remaining == null || remaining <= PREEMPTIVE_MARGIN_MS;
            // `tryAcquire` arms the floor as it grants, so two racing triggers (verified edge +
            // foreground) cannot both get through — the in-flight share alone does not cover the
            // second one arriving after this one resolves. Short-circuit order matters: the floor is
            // only consumed when the earlier conditions already hold.
            const preemptive = !expired && forceRefresh && credentialRunningOut && this.forceRefreshFloor.tryAcquire();
            if (!expired && !preemptive) return;

            if (await credentialRenewers.relay.renew()) return;

            if (!expired) {
                // A preemptive refresh that did not run is not evidence of a dead session — the
                // socket may simply not be authenticated yet.
                logger.warn('SESSION', '[stalenessGuard] preemptive relay refresh did not run');
                return;
            }
            // WHY the refresh did not run is what the log has to say. A relay socket that cannot carry
            // an `auth.refresh` right now — `handshaking` after a wake or a dropped link, or the
            // terminal `expired` whose own confirmation window (`RelayCredentialRenewer`) owns the
            // logout decision — never reached the session at all, and is no evidence it is dead. Only
            // a refusal from a socket that WAS able to ask says the credential is stale.
            const status = getAuthStatus(RELAY_SLOT, { storedSessionExpired: expired });
            if (!canRefreshThroughSocket(status)) {
                logger.warn('SESSION', '[stalenessGuard] relay socket cannot carry a refresh — left to the renewer', {
                    data: { status },
                });
                return;
            }
            logger.warn('SESSION', '[stalenessGuard] stale relay credentials not refreshed', { data: { status } });
        } catch (error) {
            // Transient (storage race, refresh rejection) — the next trigger retries.
            logger.warn('SESSION', '[stalenessGuard] credential probe failed', { error });
        }
    }
}
