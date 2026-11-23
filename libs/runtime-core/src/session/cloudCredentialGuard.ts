import { logger } from '@chatic/logger';

import { SDK_REFRESH_CYCLE_MS, isLinkKnownDown, getSocketManager, kindOf, slotKeyOf } from '@chatic/transport';
import { credentialRenewers } from '@chatic/auth';
import { getCommittedCloudId } from '@chatic/session';

import { foregroundPlatform } from './foreground';

export interface CloudCredentialPolicy {
    enabled?: boolean;
    marginMs?: number;
    checkOnVisible?: boolean;
}

const DEFAULT_MARGIN_MS = SDK_REFRESH_CYCLE_MS;

const MAX_SLEEP_MS = 5 * 60_000;
const MIN_SLEEP_MS = 1_000;
const RETRY_SLEEP_MS = 60_000;

const clampSleep = (ms: number): number => Math.min(MAX_SLEEP_MS, Math.max(MIN_SLEEP_MS, ms));

const guardedClouds = (): string[] => {
    const cids = new Set<string>();
    const committed = getCommittedCloudId();
    if (committed) cids.add(committed);
    for (const key of getSocketManager().getSlotKeys()) {
        if (kindOf(key) === 'cloud') cids.add(key);
    }
    return [...cids];
};

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

    setPolicy(policy: CloudCredentialPolicy): void {
        this.policy = CloudCredentialGuard.resolve(policy);
    }

    check = async (): Promise<void> => {
        await this.evaluate();
    };

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

    private async evaluateCloud(cid: string): Promise<number> {
        const { marginMs } = this.policy;
        const renewer = credentialRenewers.forSlot(slotKeyOf(cid));
        const remaining = renewer.timeToExpiry();
        if (remaining == null) {
            return MAX_SLEEP_MS;
        }
        if (remaining > marginMs) {
            return clampSleep(remaining - marginMs);
        }
        if (isLinkKnownDown()) {
            return RETRY_SLEEP_MS;
        }

        if (!(await renewer.renew())) {
            logger.warn('SESSION', '[cloudCredentialGuard] cloud credential renewal did not run', {
                data: { cid },
            });
            return RETRY_SLEEP_MS;
        }

        const renewed = renewer.timeToExpiry();
        return renewed != null && renewed > marginMs ? clampSleep(renewed - marginMs) : RETRY_SLEEP_MS;
    }

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
