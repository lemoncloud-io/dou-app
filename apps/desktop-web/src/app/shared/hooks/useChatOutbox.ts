import { useEffect, useRef } from 'react';

import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import type { DomainChat } from '@chatic/data';
import {
    createChatOutbox,
    useRuntimeRepositories,
    useRuntimeSocketState,
    type ChatOutbox,
    type OutboxEntry,
} from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';

/**
 * Desktop opt-in for the engine outbox: messages that failed to send go out on their own once
 * the socket is verified again. `apps/web` never calls this, so it keeps its manual-only UX.
 *
 * **Entries come from a cache SWEEP, not from the send path.** `ChatRepositoryV2.sendChat`
 * rejects with the raw error and never exposes the optimistic row's id, so a rejection hook
 * would have no row to target for the delete-before-resend or the discard. The sweep reads the
 * failed rows back out of the cache, which also recovers messages that failed in a previous app
 * session — something a send-path hook could never do.
 *
 * **One attempt per ready-transition** (`maxAttempts: 1`). `sendChat` mints a NEW optimistic row
 * on every call, so a second in-connection attempt would leave the first attempt's failed row
 * orphaned next to it — two "Not delivered" bubbles for one message. Sending once per sweep keeps
 * the invariant *at most one `isFailed` row per undelivered message*, and the next sweep re-reads
 * whatever is still failed with its current id. The engine's backoff machinery is unused here by
 * choice, not by omission: the machine is shared, the retry policy is the app's.
 */

/** Unsent rows per channel. They carry `chat_no: 0` and are never evicted, so this is a ceiling. */
const SWEEP_LIMIT = 200;
/** Newest-page depth used to look for a landed twin of a queued entry. */
const LANDING_PAGE_LIMIT = 50;
/**
 * How far a landed message's timestamp may sit from the moment the user pressed send and still
 * count as that message's twin. Anchored to the FAILED ROW'S OWN `createdAt`, never to the enqueue
 * time: the enqueue happens at reconnect, which is ~100 minutes after the send in the rotation
 * case, so an enqueue-anchored window would reject every real twin and make the probe dead weight
 * in exactly the scenario it exists for. The remaining slack absorbs client/server clock skew.
 */
const LANDING_SKEW_MS = 5 * 60_000;

// One machine per app instance. It must outlive any single component because useChatMutations
// reaches it to drop a queued entry when the user hits manual retry.
let outboxSingleton: ChatOutbox | null = null;

/** The desktop outbox, or null in an app that never opted in. */
export const getChatOutbox = (): ChatOutbox | null => outboxSingleton;

const rowTime = (row: DomainChat): number => row.createdAtMs ?? row.createdAt ?? 0;

/**
 * The cached rows worth resending, oldest first so a channel's send order survives the queue.
 * Only `isFailed` rows qualify — that is exactly the set the manual retry button acts on, and a
 * still-pending row belongs to an in-flight send we must not duplicate.
 */
export const selectResendableRows = (rows: DomainChat[], myUid: string): DomainChat[] =>
    rows
        .filter(row => row.isFailed && !!row.id && !!row.content && (row.ownerId ?? row.userId) === myUid)
        .sort((left, right) => rowTime(left) - rowTime(right));

/**
 * The server takes a parent's FULL id `<channelId>:<chatNo>`. Rows stranded by the old
 * chatNo-send bug carry the bare chatNo, so rebuild those. Mirrors useChatMutations.retryMessage.
 */
const resolveParentId = (row: DomainChat): string | undefined => {
    if (!row.parentId) return undefined;
    return row.parentId.includes(':') ? row.parentId : `${row.channelId}:${row.parentId}`;
};

export const toSendPayload = (row: DomainChat): ChatSendInput => ({
    channelId: row.channelId,
    content: row.content,
    contentType: row.contentType,
    parentId: resolveParentId(row),
});

export interface LandingQuery {
    channelId: string;
    content: string;
    myUid: string;
    /** When the user actually pressed send — the failed row's own `createdAt`. */
    sentAt: number;
}

/**
 * Finds the server-persisted twin of a queued message — the lost-ack case, where the send reached
 * the server but the ack never came back, so the row was marked failed while the message exists.
 *
 * Identity is content-based because the wire carries no client id (see outbox.ts). Content is NOT
 * unique — "ok" twice is ordinary — so a row already claimed by an earlier entry is skipped via
 * `consumed`. Without that, two identical queued messages would both match the SAME landed row and
 * the second would be discarded instead of sent, silently deleting the user's message.
 */
export const matchLandedRow = (rows: DomainChat[], query: LandingQuery, consumed: Set<string>): DomainChat | null => {
    const candidates = rows
        .filter(
            row =>
                !!row.id &&
                !consumed.has(row.id) &&
                (row.chatNo ?? 0) > 0 && // server-persisted only; never match the entry's own failed row
                row.channelId === query.channelId &&
                row.content === query.content &&
                (row.ownerId ?? row.userId) === query.myUid &&
                Math.abs(rowTime(row) - query.sentAt) <= LANDING_SKEW_MS
        )
        .sort((left, right) => rowTime(left) - rowTime(right));

    return candidates[0] ?? null;
};

/**
 * Bookkeeping for the landing probe, scoped to the OUTBOX INSTANCE — i.e. rebuilt only when the
 * cloud/identity changes, never per sweep. A claim has to outlive its sweep: a drain after the
 * ~100-minute connection rotation must not re-match a row an earlier drain already consumed.
 *
 * A row is claimed at **commit**, not at match — only once the stale local row is really gone. Two
 * consequences, both load-bearing:
 * - `remove()` (manual retry) can retire a matched entry before it discards, and that leaves NO
 *   orphaned claim, because nothing was claimed yet.
 * - If the discard itself fails, the row stays unclaimed and the next sweep can match it again,
 *   instead of being permanently unmatchable and resent as a duplicate.
 */
export interface LandingBatch {
    /** Records when the user actually sent the row behind this entry. */
    record(entryId: string, sentAt: number): void;
    /** Matches a landed row for this entry WITHOUT claiming it. */
    match(rows: DomainChat[], entry: OutboxEntry, myUid: string): DomainChat | null;
    /** Claims the row matched for this entry. Call only once the stale row is actually gone. */
    commit(entryId: string): void;
}

export const createLandingBatch = (): LandingBatch => {
    const consumed = new Set<string>();
    const sentAtById = new Map<string, number>();
    const matchedByEntry = new Map<string, string>();

    return {
        record: (entryId, sentAt) => {
            sentAtById.set(entryId, sentAt);
        },
        match: (rows, entry, myUid) => {
            const landed = matchLandedRow(
                rows,
                {
                    channelId: entry.channelId,
                    content: entry.payload.content,
                    myUid,
                    // Fall back to the enqueue time only for an entry no sweep recorded.
                    sentAt: sentAtById.get(entry.id) ?? entry.enqueuedAt,
                },
                consumed
            );
            if (landed?.id) matchedByEntry.set(entry.id, landed.id);
            return landed;
        },
        commit: entryId => {
            const rowId = matchedByEntry.get(entryId);
            if (!rowId) return;
            matchedByEntry.delete(entryId);
            consumed.add(rowId);
        },
    };
};

export const useChatOutbox = (): void => {
    const { chat: chatRepository, channel: channelRepository } = useRuntimeRepositories();
    const { userId: myUid } = useSessionIdentity();
    const { isConnected, isVerified } = useRuntimeSocketState();

    const batchRef = useRef<LandingBatch | null>(null);

    useEffect(() => {
        // Rebuilt whenever the cloud/identity changes: the machine's closures must never write
        // into the previous cloud's cache partition after a switch. `myUid` flips at cloud-switch
        // commit (useSessionIdentity is a live session-signal store), so this effect re-runs.
        const uid = myUid ?? '';
        // The batch is per outbox INSTANCE — claims survive every sweep and every rotation, and
        // are dropped only here, when the cloud changes and the old claims stop meaning anything.
        const batch = createLandingBatch();
        batchRef.current = batch;

        const readNewestPage = async (channelId: string): Promise<DomainChat[]> => {
            const page = await chatRepository.cacheReadList({ channelId, limit: LANDING_PAGE_LIMIT });
            return page?.list ?? [];
        };

        const outbox = createChatOutbox({
            maxAttempts: 1,
            hasLanded: async entry => !!batch.match(await readNewestPage(entry.channelId), entry, uid),
            // The message is already in the timeline; drop the stale "Not delivered" row, and only
            // then claim the row it matched (see LandingBatch — a failed delete must stay retryable).
            discard: async entry => {
                await chatRepository.cacheDelete(entry.id);
                batch.commit(entry.id);
            },
            // Delete before sending, exactly as the manual retry button does, so the retry
            // replaces the failed bubble instead of sitting next to it.
            send: async entry => {
                await chatRepository.cacheDelete(entry.id);
                await chatRepository.sendChat(entry.payload);
            },
        });
        outboxSingleton = outbox;
        outbox.start();

        return () => {
            outbox.stop();
            if (outboxSingleton === outbox) outboxSingleton = null;
        };
    }, [chatRepository, myUid]);

    useEffect(() => {
        const outbox = outboxSingleton;
        const batch = batchRef.current;
        if (!outbox || !batch) return;

        // `isConnected && isVerified` — NOT the connectivity banner's signal. Verification is
        // downstream of the reconnect handshake, so it is the closest proxy for "the ChatSyncPlan
        // catch-up is live", and a verified socket is stronger proof of reachability than
        // navigator.onLine ever is.
        const ready = isConnected && isVerified;
        outbox.setReady(ready);
        if (!ready) return;

        void (async () => {
            // A batch still draining already represents the work; re-sweeping mid-drain would
            // queue a second entry for a message that is being sent right now.
            if (outbox.pending().length) return;

            // An empty sid deliberately means "every place in this cloud" — the channel cache is
            // partitioned by (cid, uid) and ChannelLocalDataSourceV2 skips the place filter when
            // no sid resolves. A failed message in a place the user has since left must still go.
            const channels = await channelRepository.cacheReadList({ sid: '' });
            for (const channel of channels?.list ?? []) {
                if (!channel.id) continue;
                // cursorNo:1 bounds the read to chat_no 0 — exactly the unsent rows. A plain
                // limited page is chat_no-DESCENDING and would miss them entirely in any channel
                // holding 50+ server messages.
                const unsent = await chatRepository.cacheReadList({
                    channelId: channel.id,
                    cursorNo: 1,
                    limit: SWEEP_LIMIT,
                });
                for (const row of selectResendableRows(unsent?.list ?? [], myUid ?? '')) {
                    // The row's own createdAt is what the landing probe compares against — the
                    // enqueue time is a reconnect, potentially hours after the user pressed send.
                    batch.record(row.id, rowTime(row));
                    outbox.enqueue({ id: row.id, channelId: channel.id, payload: toSendPayload(row) });
                }
            }
        })().catch(() => undefined);
    }, [chatRepository, channelRepository, myUid, isConnected, isVerified]);
};
