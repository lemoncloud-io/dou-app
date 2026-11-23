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

export interface SessionStalenessPolicy {
    enabled?: boolean;
    intervalMs?: number | null;
    checkOnVisible?: boolean;
    checkOnRelayVerified?: boolean;
    forceRefresh?: boolean;
}

const DEFAULT_INTERVAL_MS = 30_000;

const FORCE_REFRESH_COOLDOWN_MS = 60_000;

const PREEMPTIVE_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

type ResolvedPolicy = Required<SessionStalenessPolicy>;

const resolve = (policy: SessionStalenessPolicy): ResolvedPolicy => ({
    enabled: policy.enabled ?? true,
    intervalMs: policy.intervalMs === undefined ? DEFAULT_INTERVAL_MS : policy.intervalMs,
    checkOnVisible: policy.checkOnVisible ?? false,
    checkOnRelayVerified: policy.checkOnRelayVerified ?? false,
    forceRefresh: policy.forceRefresh ?? false,
});

export class RelayCredentialGuard {
    private readonly probe = new Coalescer<void>();
    private readonly forceRefreshFloor = new Throttle({ intervalMs: FORCE_REFRESH_COOLDOWN_MS });
    private policy: ResolvedPolicy;
    private relayVerified = false;

    constructor(policy: SessionStalenessPolicy = {}) {
        this.policy = resolve(policy);
    }

    setPolicy(policy: SessionStalenessPolicy): void {
        this.policy = resolve(policy);
    }

    check = async (): Promise<void> => {
        if (isLinkKnownDown()) return;
        await this.probe.run(() => this.runProbe());
    };

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
            stops.push(manager.subscribeSlotVerified(RELAY_SLOT, observe));
        }

        return () => stops.forEach(stop => stop());
    }

    private async runProbe(): Promise<void> {
        const { forceRefresh } = this.policy;
        try {
            if (!relayCredentialProbe.hasSession()) return;
            const expired = relayCredentialProbe.isCredentialExpired();
            const now = Date.now();
            const remaining = credentialRenewers.relay.timeToExpiry(now);
            const credentialRunningOut = remaining == null || remaining <= PREEMPTIVE_MARGIN_MS;
            const preemptive = !expired && forceRefresh && credentialRunningOut && this.forceRefreshFloor.tryAcquire();
            if (!expired && !preemptive) return;

            if (await credentialRenewers.relay.renew()) return;

            if (!expired) {
                logger.warn('SESSION', '[stalenessGuard] preemptive relay refresh did not run');
                return;
            }
            const status = getAuthStatus(RELAY_SLOT, { storedSessionExpired: expired });
            if (!canRefreshThroughSocket(status)) {
                logger.warn('SESSION', '[stalenessGuard] relay socket cannot carry a refresh — left to the renewer', {
                    data: { status },
                });
                return;
            }
            logger.warn('SESSION', '[stalenessGuard] stale relay credentials not refreshed', { data: { status } });
        } catch (error) {
            logger.warn('SESSION', '[stalenessGuard] credential probe failed', { error });
        }
    }
}
