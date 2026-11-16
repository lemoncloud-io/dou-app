import { logger } from '@chatic/logger';

import { SDK_REFRESH_CYCLE_MS, isLinkKnownDown, getSocketManager, kindOf, slotKeyOf } from '@chatic/transport';
import { credentialRenewers } from '@chatic/auth';
import { getCommittedCloudId } from '@chatic/session';

import { foregroundPlatform } from './foreground';

/**
 * Keeps every cloud SOCKET session alive — the cloud counterpart of `RelayCredentialGuard`, and
 * deliberately a separate guard because the two servers recover differently:
 *
 * | | relay | cloud |
 * | --- | --- | --- |
 * | Renewal means | refresh (`ClientSocketAuth` alone) | **re-issue** (`delegate-cloud` + `exchange-token`) |
 * | Without a socket | Can't renew — nothing to do but wait | Possible as long as relay is alive |
 * | On a failed renewal | Logged; the renewer's terminal-expiry window decides | Just drop the cloud (`onAuthExpired`) |
 *
 * Folding cloud into the relay guard would mean one guard with two unrelated recovery strategies and a
 * `kind` parameter that changes everything it does — so the guards are split the same way the tokens
 * are.
 *
 * **What this actually protects, and what it does not.** It used to be described as keeping the
 * cloud's HTTP *signing* credential alive. That is no longer true: nothing signs with the cloud
 * credential, because the one request that did — the cloud
 * HTTP refresh — was deleted, and requests bound for a cloud host (`exchange-token`, invite lookups)
 * are signed the RELAY way. What is at stake is the cloud SOCKET's token: `renewCloudSession`
 * re-issues it AND re-registers the socket, and skipping that leaves the SDK resending an expired
 * token until `onAuthExpired` drops the user out of the cloud.
 *
 * The credential's `Expiration` is still the right clock — not because it signs anything, but because
 * it is minted with the cloud token and expires alongside it, which makes it a measurable proxy for
 * the token's age (`credentialFreshness` says the same of a cloud).
 *
 * Trigger is a self-arming deadline, not a poll: that `Expiration` says exactly when to act, so the
 * guard sleeps until `Expiration - margin` (bounded, see below) instead of asking every N seconds.
 * `check` is there for hosts with a trigger this guard cannot know about — apps/web fires it on
 * WebView foreground, where a suspended tab's timer fires late or not at all.
 *
 * **Which clouds.** The committed cloud, and every cloud that has a socket slot bound — each
 * background cloud included — with one timer armed on the earliest deadline among them. That set is
 * what lets a cloud the user is not looking at keep its socket session. Each cloud renews through
 * its own renewer, so one cloud's failed exchange never delays another's.
 */
export interface CloudCredentialPolicy {
    /** Off by default is wrong for a guard — callers opt out explicitly. */
    enabled?: boolean;
    /** Renew once the credential has this little life left. */
    marginMs?: number;
    /**
     * Re-check when the app returns to the foreground (`RuntimePorts.foreground`). A suspended page does
     * not fire its timers on time.
     */
    checkOnVisible?: boolean;
}

/**
 * One SDK refresh cycle (`AUTH_OPTIONS.refreshIntervalMs`, 5 min — the server does not report
 * `expiresIn`). A healthy cloud socket re-mints the credential every cycle, so a credential that has
 * dropped below this margin is ITSELF the evidence that the socket is not keeping up. That makes the
 * margin a socket-health probe we get for free rather than a number to tune, and it keeps the renewal
 * from competing with a refresh that was about to land anyway.
 */
const DEFAULT_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

/**
 * Ceiling on a single sleep. A credential minted an hour out would otherwise park one long timer, and
 * a long timer is exactly what a suspended/throttled tab fires late — this way the deadline is
 * re-derived from the store at least this often, which also picks up a cloud entered (or left) while
 * the guard kept running. The tick itself is a store read and a subtraction; no I/O.
 */
const MAX_SLEEP_MS = 5 * 60_000;
/** Floor, so a lapsed-but-unrenewable credential cannot spin the timer. */
const MIN_SLEEP_MS = 1_000;
/** Sleep after a renewal that did not happen (offline, relay stale, exchange rejected). */
const RETRY_SLEEP_MS = 60_000;

const clampSleep = (ms: number): number => Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, ms));

/**
 * The clouds whose socket session this guard keeps alive: the committed one (its slot may not be
 * bound yet — the device id can arrive after the tokens) plus every cloud that has a slot bound.
 * Re-derived on every tick, so a cloud entered or left while the guard kept running is picked up
 * within one sleep.
 */
const guardedClouds = (): string[] => {
    const cids = new Set<string>();
    const committed = getCommittedCloudId();
    if (committed) cids.add(committed);
    for (const key of getSocketManager().getSlotKeys()) {
        if (kindOf(key) === 'cloud') cids.add(key);
    }
    return [...cids];
};

/**
 * The cloud credential guard. `check()` evaluates every guarded cloud once; `start()` runs the
 * self-arming timer (and the foreground trigger, when the policy asks) and returns their stop. `check`
 * is also for a host with a trigger this guard cannot know about. React reaches it through
 * `runtime.session.useCloudCredentialGuard`, which only starts and stops it.
 */
export class CloudCredentialGuard {
    private policy: Required<CloudCredentialPolicy>;

    constructor(policy: CloudCredentialPolicy = {}) {
        this.policy = CloudCredentialGuard.resolve(policy);
    }

    private static resolve(policy: CloudCredentialPolicy): Required<CloudCredentialPolicy> {
        return {
            enabled: policy.enabled ?? true,
            marginMs: policy.marginMs ?? DEFAULT_MARGIN_MS,
            checkOnVisible: policy.checkOnVisible ?? true,
        };
    }

    /** Replaces the policy. The next evaluation reads it; triggers are re-armed by the next `start`. */
    setPolicy(policy: CloudCredentialPolicy): void {
        this.policy = CloudCredentialGuard.resolve(policy);
    }

    check = async (): Promise<void> => {
        await this.evaluate();
    };

    /** Runs the timer, and the foreground trigger if asked; returns their stop. Runs nothing while disabled. */
    start(): () => void {
        const { enabled, checkOnVisible } = this.policy;
        if (!enabled) return () => undefined;
        let cancelled = false;
        let handle: ReturnType<typeof setTimeout> | undefined;

        const tick = async (): Promise<void> => {
            const sleepMs = await this.evaluate();
            if (cancelled) return;
            handle = setTimeout(() => void tick(), sleepMs);
        };
        void tick();

        let unsubscribeForeground: () => void = () => undefined;
        if (checkOnVisible) {
            const foreground = foregroundPlatform.ports();
            unsubscribeForeground = foreground.subscribe(() => {
                if (foreground.read()) void this.check();
            });
        }

        return () => {
            cancelled = true;
            if (handle) clearTimeout(handle);
            unsubscribeForeground();
        };
    }

    /** Evaluates one cloud's deadline, renews if it has arrived, and reports how long to sleep next. */
    private async evaluateCloud(cid: string): Promise<number> {
        const { marginMs } = this.policy;
        const renewer = credentialRenewers.forSlot(slotKeyOf(cid));
        const remaining = renewer.timeToExpiry();
        if (remaining == null) {
            // No token for this cloud, or a token view with no credential to measure — nothing to renew.
            return MAX_SLEEP_MS;
        }
        if (remaining > marginMs) {
            return clampSleep(remaining - marginMs);
        }
        if (isLinkKnownDown()) {
            // The exchange would only fail; the credential is no more expired for having waited.
            return RETRY_SLEEP_MS;
        }

        if (!(await renewer.renew())) {
            // Not a teardown signal: cloud loss is recoverable by re-entry, and `onAuthExpired`
            // already owns the "give up on this cloud" decision.
            logger.warn('SESSION', '[cloudCredentialGuard] cloud credential renewal did not run', {
                data: { cid },
            });
            return RETRY_SLEEP_MS;
        }

        // Re-derive from the token we just wrote rather than assuming a full lifetime.
        const renewed = renewer.timeToExpiry();
        return renewed != null && renewed > marginMs ? clampSleep(renewed - marginMs) : RETRY_SLEEP_MS;
    }

    /**
     * Every guarded cloud at once; the next sleep is the earliest of their deadlines. Side by side,
     * not in turn: each cloud's renewal is its own single flight, and one cloud's slow exchange must
     * not hold up measuring the others. A throw — corrupt storage under a token read, say — costs
     * that cloud one retry sleep and nothing else. It must never escape: the timer re-arms only when
     * this resolves, so a rejection here would silently end the guard for every cloud.
     */
    private async evaluate(): Promise<number> {
        const sleeps = await Promise.all(
            guardedClouds().map(cid =>
                this.evaluateCloud(cid).catch(error => {
                    logger.warn('SESSION', '[cloudCredentialGuard] evaluation failed — retrying later', {
                        error,
                        data: { cid },
                    });
                    return RETRY_SLEEP_MS;
                })
            )
        );
        return Math.min(MAX_SLEEP_MS, ...sleeps);
    }
}
