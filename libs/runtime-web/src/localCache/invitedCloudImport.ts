import type { CacheModelOf, CacheQueryOf } from '@chatic/bridge-messages';
import type { CacheStorage } from '@chatic/data';
import { logger } from '@chatic/logger';

type InvitedCloudRow = CacheModelOf<'invitecloud'>;

/** Set in the tab's own storage once the tab has taken its rows from IndexedDB. */
export const INVITED_CLOUD_IMPORT_MARKER_KEY = 'chatic-invitecloud-imported';

export interface InvitedCloudImportOptions {
    /** Where the marker is kept — the tab's `sessionStorage`, the same area the rows now live in. */
    marker: Storage;
    /** The tab's guest, read when the import runs: rows it accepted are carried over. */
    getDelegatorId: () => string | null;
    /** Clouds this tab's session holds a uid in, read when the import runs: carried over too. */
    getRecordedCloudIds: () => string[];
}

/**
 * Wraps the tab's `sessionStorage` store for invited clouds so that, the first time the tab touches
 * it, the rows this tab entered while they were still kept in IndexedDB are copied in.
 *
 * **Who needs it.** A browser tab open across the deploy that moved the domain to `sessionStorage`.
 * Its session survives a reload (it is in `sessionStorage` already), but its invited clouds sat in
 * IndexedDB — and the domain has no server list to refill from, while the push-driven recovery only
 * runs in the native shell. Without the copy the tab would lose every invited cloud on its next
 * reload. A tab opened afterwards has a new guest, which entered nothing yet, so it imports nothing.
 *
 * **Which rows.** Those this tab can be shown to own, by either of two tab-scoped records: the row's
 * `acceptedBy` names the tab's guest (apps/web writes it on accept), or the tab's session holds a uid
 * in that cloud (every entry records one; desktop-web writes no `acceptedBy`, so this is its only
 * proof). Both records live in the tab's own `sessionStorage`. Any other row — another guest's, or an
 * unattributed one nothing here entered — stays behind: those are the rows that leaked between
 * guests. The IndexedDB rows are read, never deleted: a tab still running the previous build reads
 * them there.
 *
 * **Once per guest tab.** The marker is set after a pass that ran with a guest id, including one that
 * found nothing, so a row this tab later removes is not brought back from IndexedDB on the next boot.
 * A pass with no guest id — an account session, or the reload after a logout — leaves it unset: the
 * guest that comes back with the tab's device id should still get its rows on a later boot. A failed
 * read leaves it unset too. Either way the current page lifetime carries on with what the tab store
 * has rather than failing the domain.
 *
 * Every operation waits for the pass, so a read cannot answer before the copy has landed and a write
 * cannot be overwritten by it.
 */
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
                // A row the tab store already holds was written by this build, after the move, and is
                // newer than anything IndexedDB has.
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

/** Storage access can throw in a few browser configurations; that reads as "not imported yet". */
const readMarker = (marker: Storage): boolean => {
    try {
        return marker.getItem(INVITED_CLOUD_IMPORT_MARKER_KEY) === '1';
    } catch {
        return false;
    }
};
