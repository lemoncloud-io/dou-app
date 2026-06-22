import type { DomainSyncPlan, DomainSyncContext, SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { DataRepositoriesV2 } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { SiteSyncTarget } from './types';

export class SiteSyncPlan implements DomainSyncPlan<SiteSyncTarget> {
    readonly domain = 'site';

    constructor(
        private readonly deps: {
            getRepositories(): DataRepositoriesV2;
            onSyncStart?: () => void;
            onSyncFinished?: () => void;
        }
    ) {}

    public supports(target: SyncTargetDescriptor): target is SiteSyncTarget {
        return target.type === 'site';
    }

    public getKey(target: SiteSyncTarget): string {
        return target.id ? `site:${target.id}` : 'site';
    }

    public async run(target: SiteSyncTarget, ctx: DomainSyncContext): Promise<void> {
        this.deps.onSyncStart?.();
        try {
            const repositories = this.deps.getRepositories();
            await repositories.site.refreshList();
        } catch (error) {
            logger.error('SYNC', '[SiteSyncPlan] sync run failed', {
                error,
                data: { target },
            });
        } finally {
            this.deps.onSyncFinished?.();
        }
    }
}
