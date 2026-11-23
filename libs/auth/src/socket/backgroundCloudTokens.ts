import { logger } from '@chatic/logger';

import { SDK_REFRESH_CYCLE_MS } from '@chatic/transport';

export const BACKGROUND_TOKEN_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 15 * 60_000;

export interface BackgroundCloudTokenDeps {
    issue(cid: string): Promise<unknown>;
    hasEntry(cid: string): boolean;
    timeToExpiry(cid: string): number | null;
    isSlotBound(cid: string): boolean;
    onIssued(): void;
    takeExpired(cid: string): boolean;
    isOnline(): boolean;
    now(): number;
    setTimer(run: () => void, ms: number): unknown;
    clearTimer(handle: unknown): void;
}

type ReadinessDeps = Pick<BackgroundCloudTokenDeps, 'hasEntry' | 'timeToExpiry' | 'isSlotBound'>;

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
