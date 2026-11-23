import type { CacheModelOf, CacheQueryOf } from '@chatic/bridge-messages';
import type { CacheStorage } from '@chatic/data';
import { logger } from '@chatic/logger';

type InvitedCloudRow = CacheModelOf<'invitecloud'>;

export const INVITED_CLOUD_IMPORT_MARKER_KEY = 'chatic-invitecloud-imported';

export interface InvitedCloudImportOptions {
    marker: Storage;
    getDelegatorId: () => string | null;
    getRecordedCloudIds: () => string[];
}

export class InvitedCloudImportStorage implements CacheStorage<'invitecloud'> {
    private pass: Promise<void> | null = null;

    constructor(
        private readonly target: CacheStorage<'invitecloud'>,
        private readonly legacy: () => CacheStorage<'invitecloud'>,
        private readonly options: InvitedCloudImportOptions
    ) {}

    private ready(): Promise<void> {
        this.pass ??= this.runPass();
        return this.pass;
    }

    private async runPass(): Promise<void> {
        if (readMarker(this.options.marker)) return;
        try {
            const delegatorId = this.options.getDelegatorId();
            const recorded = new Set(this.options.getRecordedCloudIds());
            if (delegatorId || recorded.size > 0) {
                const legacyRows = await this.legacy().loadAll();
                const owned = legacyRows.filter(
                    row => (!!delegatorId && !!row.acceptedBy?.includes(delegatorId)) || recorded.has(row.id)
                );
                const held = new Set((await this.target.loadMany(owned.map(row => row.id))).map(row => row.id));
                const missing = owned.filter(row => !held.has(row.id));
                if (missing.length > 0) await this.target.saveAll(missing);
                logger.info('CACHE', 'invited clouds imported into the tab store', {
                    data: { imported: missing.length, skipped: legacyRows.length - owned.length },
                });
            }
            if (delegatorId) this.options.marker.setItem(INVITED_CLOUD_IMPORT_MARKER_KEY, '1');
        } catch (error) {
            logger.warn('CACHE', 'invited cloud import failed — retried on the next boot', {
                data: { error: error instanceof Error ? error.message : String(error) },
            });
        }
    }

    async save(id: string, item: InvitedCloudRow): Promise<InvitedCloudRow> {
        await this.ready();
        return this.target.save(id, item);
    }

    async saveAll(items: InvitedCloudRow[]): Promise<InvitedCloudRow[]> {
        await this.ready();
        return this.target.saveAll(items);
    }

    async load(id: string): Promise<InvitedCloudRow | null> {
        await this.ready();
        return this.target.load(id);
    }

    async loadMany(ids: string[]): Promise<InvitedCloudRow[]> {
        await this.ready();
        return this.target.loadMany(ids);
    }

    async loadAll(query?: CacheQueryOf<'invitecloud'>): Promise<InvitedCloudRow[]> {
        await this.ready();
        return this.target.loadAll(query);
    }

    async delete(id: string): Promise<void> {
        await this.ready();
        return this.target.delete(id);
    }

    async deleteAll(ids: string[]): Promise<void> {
        await this.ready();
        return this.target.deleteAll(ids);
    }

    async clearAll(): Promise<void> {
        await this.ready();
        return this.target.clearAll();
    }

    async clearByChannelId(channelId: string): Promise<void> {
        await this.ready();
        return this.target.clearByChannelId(channelId);
    }
}

const readMarker = (marker: Storage): boolean => {
    try {
        return marker.getItem(INVITED_CLOUD_IMPORT_MARKER_KEY) === '1';
    } catch {
        return false;
    }
};
