import { logger } from '@chatic/bridges';

import { SDK_REFRESH_CYCLE_MS } from '../constants';

/**
 * Gets a background cloud's tokens into the per-cloud cache BEFORE its slot boots, so the slot never
 * registers with a token that is about to be replaced.
 *
 * A slot signs with whatever the cache holds for its cloud (`cloudStore.getCloudTokenOf`). Booting on
 * a nearly expired entry and re-issuing underneath it would leave the socket registered with one
 * token and signing with another. So there are exactly two owners of a background cloud's tokens,
 * split by whether its slot is bound:
 *
 * - **not bound** — this module. It issues (two HTTP calls, `delegate-cloud` + `exchange-token`)
 *   when the entry is missing or has less than one refresh cycle left, and the slot is derived only
 *   once `isBackgroundCloudReady` says so;
 * - **bound** — `useCloudCredentialGuard`, which re-issues AND re-registers the socket in one step
 *   (`renewCloudSession`). This module never touches a bound cloud.
 *
 * A failed issue backs off per cloud (60s, doubling, capped at 15 min): the usual causes are an
 * offline device or a relay credential being refreshed, and a cloud the account was removed from
 * would otherwise be retried every minute forever. Two outcomes that are not rejections count as
 * failures too, because retrying them at once would loop:
 *
 * - an issue that lands but still leaves the cloud not ready (the server's answer carries no `wss`,
 *   or a credential already inside the margin — a device clock far ahead, say);
 * - a cloud whose socket session just expired terminally (`noteExpired`), so the slot that was torn
 *   down for it is not re-issued and re-booted into the same expiry straight away.
 */

/** Less than this left means the entry is re-issued before a slot boots on it — one SDK refresh cycle. */
export const BACKGROUND_TOKEN_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;

export interface BackgroundCloudTokenDeps {
    /** Issues fresh tokens for `cid` into the per-cloud cache, never serving the cache. */
    issue(cid: string): Promise<unknown>;
    /** Whether the per-cloud cache holds an entry for `cid` a socket could authenticate with. */
    hasEntry(cid: string): boolean;
    /** Milliseconds left on `cid`'s cached credential; null when there is nothing to measure. */
    timeToExpiry(cid: string): number | null;
    /** Whether a slot for `cid` is bound right now. */
    isSlotBound(cid: string): boolean;
    /** Called after an issue lands — the slots must be re-derived, since the cache announces nothing. */
    onIssued(): void;
    /** Whether `cid`'s socket session expired terminally since the last ask; answering clears it. */
    takeExpired(cid: string): boolean;
    isOnline(): boolean;
    now(): number;
    setTimer(run: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
}

type ReadinessDeps = Pick<BackgroundCloudTokenDeps, 'hasEntry' | 'timeToExpiry' | 'isSlotBound'>;

/**
 * Whether `cid` may have a background slot derived for it: its slot is already bound (its tokens are
 * the guard's to keep), or its cached entry has more than the margin left. An entry with no
 * measurable credential is taken as it is — there is no clock to refuse it by.
 */
export const isBackgroundCloudReady = (cid: string, deps: ReadinessDeps): boolean => {
    if (deps.isSlotBound(cid)) return true;
    if (!deps.hasEntry(cid)) return false;
    const remaining = deps.timeToExpiry(cid);
    return remaining == null || remaining > BACKGROUND_TOKEN_MARGIN_MS;
};

interface Failure {
    attempts: number;
    retryAt: number;
}

export class BackgroundCloudTokens {
    private readonly inFlight = new Set<string>();
    private readonly failures = new Map<string, Failure>();
    private wanted: readonly string[] = [];
    private timer: unknown = null;
    private disposed = false;

    constructor(private readonly deps: BackgroundCloudTokenDeps) {}

    /** Makes sure every cloud in `cids` is ready or on its way; forgets clouds no longer wanted. */
    sync(cids: readonly string[]): void {
        if (this.disposed) return;
        this.wanted = [...cids];
        for (const cid of this.failures.keys()) {
            if (!cids.includes(cid)) this.failures.delete(cid);
        }

        const now = this.deps.now();
        for (const cid of cids) {
            if (this.inFlight.has(cid)) continue;
            if (this.deps.takeExpired(cid)) {
                this.recordFailure(cid, 'socket session expired');
                continue;
            }
            if (isBackgroundCloudReady(cid, this.deps)) continue;
            const failure = this.failures.get(cid);
            if (failure && failure.retryAt > now) continue;
            if (!this.deps.isOnline()) {
                // Not an attempt: the exchange would only fail. Look again after one base interval.
                this.failures.set(cid, { attempts: failure?.attempts ?? 0, retryAt: now + RETRY_BASE_MS });
                continue;
            }
            void this.issue(cid);
        }
        this.schedule();
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer != null) this.deps.clearTimer(this.timer);
        this.timer = null;
    }

    private async issue(cid: string): Promise<void> {
        this.inFlight.add(cid);
        try {
            await this.deps.issue(cid);
            if (!isBackgroundCloudReady(cid, this.deps)) {
                this.recordFailure(cid, 'issued tokens are not usable');
                return;
            }
            this.failures.delete(cid);
            logger.info('SOCKET', '[backgroundCloudTokens] background cloud tokens issued', { data: { cid } });
            if (!this.disposed) this.deps.onIssued();
        } catch (error) {
            this.recordFailure(cid, 'issue failed', error);
        } finally {
            this.inFlight.delete(cid);
        }
    }

    private recordFailure(cid: string, reason: string, error?: unknown): void {
        const attempts = (this.failures.get(cid)?.attempts ?? 0) + 1;
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (attempts - 1));
        this.failures.set(cid, { attempts, retryAt: this.deps.now() + delay });
        logger.warn('SOCKET', '[backgroundCloudTokens] background cloud not ready — backing off', {
            error,
            data: { cid, reason, attempts, retryInMs: delay },
        });
        this.schedule();
    }

    /** One timer, on the earliest retry among the clouds still wanted. */
    private schedule(): void {
        if (this.disposed) return;
        if (this.timer != null) this.deps.clearTimer(this.timer);
        this.timer = null;
        const retries = [...this.failures.values()].map(failure => failure.retryAt);
        if (retries.length === 0) return;
        const delay = Math.max(0, Math.min(...retries) - this.deps.now());
        this.timer = this.deps.setTimer(() => {
            this.timer = null;
            this.sync(this.wanted);
        }, delay);
    }
}
