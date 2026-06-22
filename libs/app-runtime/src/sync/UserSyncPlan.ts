import type { DomainSyncPlan, DomainSyncContext, SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { DataRepositoriesV2 } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { UserSyncTarget } from './types';

export class UserSyncPlan implements DomainSyncPlan<UserSyncTarget> {
    readonly domain = 'user';

    constructor(
        private readonly deps: {
            getRepositories(): DataRepositoriesV2;
            onSyncStart?: () => void;
            onSyncFinished?: () => void;
        }
    ) {}

    public supports(target: SyncTargetDescriptor): target is UserSyncTarget {
        return target.type === 'user';
    }

    public getKey(target: UserSyncTarget): string {
        return target.id ? `user:${target.id}` : 'user';
    }

    public async run(target: UserSyncTarget, ctx: DomainSyncContext): Promise<void> {
        this.deps.onSyncStart?.();
        try {
            const repositories = this.deps.getRepositories();
            await repositories.user.refreshList({});
        } catch (error) {
            logger.error('SYNC', '[UserSyncPlan] sync run failed', {
                error,
                data: { target },
            });
        } finally {
            this.deps.onSyncFinished?.();
        }
    }
}
