import type { DomainSyncPlan, DomainSyncContext, SyncTargetDescriptor } from '@lemoncloud/chatic-sockets-lib';
import type { DataRepositoriesV2 } from '@chatic/data';
import { logger } from '@chatic/bridges';
import type { ProfileSyncTarget, ProfileSyncSnapshot } from './types';

export class ProfileSyncPlan implements DomainSyncPlan<ProfileSyncTarget> {
    readonly domain = 'profile';

    constructor(
        private readonly deps: {
            getRepositories(): DataRepositoriesV2;
            onConnected?: () => void;
            onSyncStart?: () => void;
            onSyncSuccess?: (syncedAt: number, isFullSync: boolean) => void;
            onSyncFinished?: () => void;
        }
    ) {}

    public supports(target: SyncTargetDescriptor): target is ProfileSyncTarget {
        return target.type === 'profile';
    }

    public getKey(target: ProfileSyncTarget): string {
        return target.id ? `profile:${target.id}` : 'profile';
    }

    public onConnected(target: ProfileSyncTarget, ctx: DomainSyncContext): void {
        ctx.writeSnapshot(target, { lastSyncedAt: 0 });
        this.deps.onConnected?.();
    }

    public async run(target: ProfileSyncTarget, ctx: DomainSyncContext): Promise<void> {
        this.deps.onSyncStart?.();
        try {
            const snapshot = ctx.readSnapshot<ProfileSyncSnapshot>(target);
            const since = snapshot ? snapshot.lastSyncedAt : 0;
            const isFullSync = since === 0;

            const repositories = this.deps.getRepositories();
            const profileResult = await repositories.profile.syncProfiles(since);

            ctx.writeSnapshot(target, { lastSyncedAt: profileResult.syncedAt });
            this.deps.onSyncSuccess?.(profileResult.syncedAt, isFullSync);
        } catch (error) {
            logger.error('SYNC', '[ProfileSyncPlan] sync run failed', {
                error,
                data: { target },
            });
        } finally {
            this.deps.onSyncFinished?.();
        }
    }
}
