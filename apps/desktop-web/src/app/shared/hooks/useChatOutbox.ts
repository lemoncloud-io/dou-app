import { useEffect, useRef } from 'react';

import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DataRepositories, DomainChat } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

/**
 * Desktop opt-in for the engine outbox: messages that failed to send go out on their own once
 * the socket of the cloud they were written in is verified again. `apps/web` never calls this, so
 * it keeps its manual-only UX.
 *
 * **Every joined cloud, not the selected one.** A failed message belongs to the cloud it was
 * written in — its row sits in that cloud's partition and its channel id means nothing anywhere
 * else — so each entry carries its cloud, and its probe, delete and resend all go through that
 * cloud's own repository graph and socket slot. A message that failed in cloud A is resent to A
 * while the user is looking at B, and one instance lives for the whole relay account, so a cloud
 * switch neither drops the queue nor points it at another partition.
 *
 * **The outbox never opens a socket.** It sends only to a cloud whose slot is bound and verified
 * right now (`useVerifiedClouds`). A cloud without one keeps its failed rows — with their manual
 * retry button — until something else gives it a slot, and its sweep runs the moment it does.
 *
 * **Entries come from a cache SWEEP, not from the send path.** `ChatRepository.sendChat`
 * rejects with the raw error and never exposes the optimistic row's id, so a rejection hook
 * would have no row to target for the delete-before-resend or the discard. The sweep reads the
 * failed rows back out of the cache, which also recovers messages that failed in a previous app
 * session — something a send-path hook could never do.
 *
 * **One attempt per ready-transition**, which the engine now owns (see outbox.ts). Sending once per
 * sweep keeps the invariant *at most one `isFailed` row per undelivered message*, and the next
 * sweep re-reads whatever is still failed with its current id.
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

// One machine per relay account. It must outlive any single component because useChatMutations
// reaches it to drop a queued entry when the user hits manual retry.
let outboxSingleton: runtime.data.ChatOutbox | null = null;

/** The desktop outbox, or null in an app that never opted in. */
export const getChatOutbox = (): runtime.data.ChatOutbox | null => outboxSingleton;

/** A cached row known to carry the text to send. */
export type SendableChat = DomainChat & { content: string };

const rowTime = (row: DomainChat): number => row.createdAtMs ?? row.createdAt ?? 0;

/**
 * The cached rows worth resending, oldest first so a channel's send order survives the queue.
 * Only `isFailed` rows qualify — that is exactly the set the manual retry button acts on, and a
 * still-pending row belongs to an in-flight send we must not duplicate.
 */
export const selectResendableRows = (rows: DomainChat[], myUid: string): SendableChat[] =>
    rows
        .filter((row): row is SendableChat => !!row.isFailed && !!row.id && !!row.content && row.ownerId === myUid)
        .sort((left, right) => rowTime(left) - rowTime(right));

/**
 * The server takes a parent's FULL id `<channelId>:<chatNo>`. Rows stranded by the old
 * chatNo-send bug carry the bare chatNo, so rebuild those. Mirrors useChatMutations.retryMessage.
 */
const resolveParentId = (row: DomainChat): string | undefined => {
    if (!row.parentId) return undefined;
    return row.parentId.includes(':') ? row.parentId : `${row.channelId}:${row.parentId}`;
};

export const toSendPayload = (row: SendableChat): ChatSendInput => ({
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
                row.ownerId === query.myUid &&
                Math.abs(rowTime(row) - query.sentAt) <= LANDING_SKEW_MS
        )
        .sort((left, right) => rowTime(left) - rowTime(right));

    return candidates[0] ?? null;
};

/**
 * Bookkeeping for the landing probe of ONE cloud partition, owned by the outbox instance — i.e.
 * dropped only when the account changes, never per sweep. A claim has to outlive its sweep: a drain
 * after the ~100-minute connection rotation must not re-match a row an earlier drain already consumed.
 * One per partition because a row id is only unique inside one: two clouds can both hold `ch-1:7`,
 * and a claim on one cloud's row must not make the other cloud's twin unmatchable.
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
    match(rows: DomainChat[], entry: runtime.data.OutboxEntry, myUid: string): DomainChat | null;
    /** Claims the row matched for this entry. Call only once the stale row is actually gone. */
    commit(entryId: string): void;
    /**
     * Drops recorded send times for entries outside `keep`. Every resend mints a NEW optimistic row
     * id, so a message that keeps failing leaves one dead key behind per sweep — unbounded in a
     * process that runs for days. Claims are NOT pruned: outliving sweeps is their whole job.
     */
    forget(keep: Set<string>): void;
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
        forget: keep => {
            for (const entryId of sentAtById.keys()) {
                if (!keep.has(entryId)) sentAtById.delete(entryId);
            }
        },
    };
};

/**
 * What the outbox reaches in the runtime, per cloud. Injected so the machine can be exercised
 * against fake clouds; the hook hands it the runtime's own entry points.
 */
export interface CloudOutboxDeps {
    /** The repository graph bound to `cid` — its partition, whichever cloud is selected. */
    repositoriesOf(cid: string): Pick<DataRepositories, 'chat' | 'channel'>;
    /** Sends to `cid` over that cloud's socket slot. */
    sendInCloud(cid: string, payload: ChatSendInput): Promise<unknown>;
    /** The uid this account has in `cid` — every cloud gives it a different one. */
    uidOf(cid: string): string | null;
}

export interface CloudOutbox {
    outbox: runtime.data.ChatOutbox;
    /** Reads `cid`'s failed rows back into the queue. Call when that cloud's socket became verified. */
    sweep(cid: string): Promise<void>;
}

export const createCloudOutbox = ({ repositoriesOf, sendInCloud, uidOf }: CloudOutboxDeps): CloudOutbox => {
    // Keyed by partition (cloud + the uid in it), not by cloud alone: an account change inside one
    // cloud is a different partition, whose row ids the old claims say nothing about.
    const batches = new Map<string, LandingBatch>();
    const batchOf = (cid: string): LandingBatch => {
        const key = `${cid}|${uidOf(cid) ?? ''}`;
        let batch = batches.get(key);
        if (!batch) {
            batch = createLandingBatch();
            batches.set(key, batch);
        }
        return batch;
    };

    const readNewestPage = async (cid: string, channelId: string): Promise<DomainChat[]> => {
        const page = await repositoriesOf(cid).chat.cacheReadList({ channelId, limit: LANDING_PAGE_LIMIT });
        return page?.list ?? [];
    };

    const outbox = runtime.data.createChatOutbox({
        hasLanded: async entry =>
            !!batchOf(entry.cid).match(await readNewestPage(entry.cid, entry.channelId), entry, uidOf(entry.cid) ?? ''),
        // The message is already in the timeline; drop the stale "Not delivered" row, and only
        // then claim the row it matched (see LandingBatch — a failed delete must stay retryable).
        discard: async entry => {
            await repositoriesOf(entry.cid).chat.cacheDelete(entry.id);
            batchOf(entry.cid).commit(entry.id);
        },
        // Delete before sending, exactly as the manual retry button does, so the retry
        // replaces the failed bubble instead of sitting next to it. Both halves are the entry's
        // cloud: the row is in its partition and the message has to reach its server.
        send: async entry => {
            await repositoriesOf(entry.cid).chat.cacheDelete(entry.id);
            await sendInCloud(entry.cid, entry.payload);
        },
    });

    const sweep = async (cid: string): Promise<void> => {
        // A batch still draining already represents the work; re-sweeping mid-drain would
        // queue a second entry for a message that is being sent right now. Per cloud: another
        // cloud's drain says nothing about this one's rows.
        if (outbox.pending(cid).length) return;
        // No uid in this cloud means no row there can be mine.
        const myUid = uidOf(cid);
        if (!myUid) return;
        const { chat: chatRepository, channel: channelRepository } = repositoriesOf(cid);
        const batch = batchOf(cid);

        // An empty sid deliberately means "every place in this cloud" — the channel cache is
        // partitioned by (cid, uid) and ChannelLocalDataSource skips the place filter when
        // no sid resolves. A failed message in a place the user has since left must still go.
        const channels = await channelRepository.cacheReadList({ sid: '' });
        const channelIds = (channels?.list ?? []).map(channel => channel.id).filter((id): id is string => !!id);

        // Concurrent, following useMessageSearch: the reads are independent, and per-channel
        // send order is preserved by the outbox's per-channel queue, not by read order. Issued
        // sequentially these N round trips each queue behind the reconnect catch-up's writes on
        // the same store — N stalls instead of one.
        // cursorNo:1 bounds each read to chat_no 0 — exactly the unsent rows. A plain limited
        // page is chat_no-DESCENDING and would miss them in any channel holding 50+ server rows.
        // A read that FAILED is carried as such (`failed`), not folded into `rows: []`: an empty
        // list says the channel has nothing unsent, a rejection says nothing about it.
        const perChannel = await Promise.all(
            channelIds.map(channelId =>
                chatRepository
                    .cacheReadList({ channelId, cursorNo: 1, limit: SWEEP_LIMIT })
                    .then(result => ({ channelId, rows: result?.list ?? [], failure: undefined as unknown }))
                    .catch((failure: unknown) => ({ channelId, rows: [] as DomainChat[], failure: failure ?? true }))
            )
        );

        // Nothing is recorded for a skipped channel, so the next sweep (the cloud's next
        // ready-transition) reads it again like any other; this only makes the skip visible.
        const failed = perChannel.filter(({ failure }) => failure !== undefined);
        if (failed.length) {
            logger.warn('CHAT', '[useChatOutbox] unsent-row read failed; channels skipped this sweep', {
                cid,
                channelIds: failed.map(({ channelId }) => channelId),
                error: failed[0].failure,
            });
        }

        const swept = new Set<string>();
        for (const { channelId, rows } of perChannel) {
            for (const row of selectResendableRows(rows, myUid)) {
                // The row's own createdAt is what the landing probe compares against — the
                // enqueue time is a reconnect, potentially hours after the user pressed send.
                batch.record(row.id, rowTime(row));
                swept.add(row.id);
                // The cloud is the partition the row was read from, which is also the row's own
                // `cid`: its delete and its resend both have to land there.
                outbox.enqueue({ id: row.id, cid, channelId, payload: toSendPayload(row) });
            }
        }
        // Every send mints a NEW optimistic row id, so a message that keeps failing leaves a
        // dead key behind on every sweep — unbounded in a desktop app that runs for days.
        // Safe here: the guard above proved nothing of this cloud's is in flight.
        batch.forget(swept);
    };

    return { outbox, sweep };
};

export const useChatOutbox = (): void => {
    // The relay uid names the ACCOUNT, and it does not move on a cloud switch — unlike the session
    // uid, which flips to each cloud's own uid at every switch commit and used to rebuild the
    // machine (and throw its queue away) every time the user changed clouds.
    const relayUid = runtime.session.useUidInCloud(RELAY_CLOUD_ID);
    const verifiedClouds = runtime.connection.useVerifiedClouds();

    const machineRef = useRef<CloudOutbox | null>(null);
    // The clouds this instance has been told are ready, to turn the verified SET into edges.
    const readyRef = useRef<ReadonlySet<string>>(new Set());

    useEffect(() => {
        // Rebuilt only when the account changes: the previous account's entries and claims name
        // partitions the new one cannot address. Per-cloud uids are read per use (`getUidInCloud`),
        // so they need no rebuild here.
        const machine = createCloudOutbox({
            repositoriesOf: runtime.data.getCloudRepositories,
            sendInCloud: runtime.data.sendChatInCloud,
            uidOf: runtime.session.getUidInCloud,
        });
        machineRef.current = machine;
        // A fresh machine has no cloud ready, so every verified cloud has to be announced again.
        readyRef.current = new Set();
        outboxSingleton = machine.outbox;
        machine.outbox.start();

        return () => {
            machine.outbox.stop();
            if (machineRef.current === machine) machineRef.current = null;
            if (outboxSingleton === machine.outbox) outboxSingleton = null;
        };
    }, [relayUid]);

    useEffect(() => {
        const machine = machineRef.current;
        if (!machine) return;

        // A cloud's slot being verified — NOT the connectivity banner's signal. Verification is
        // downstream of the reconnect handshake, so it is the closest proxy for "that cloud's
        // ChatSyncPlan catch-up is live", and a verified socket is stronger proof of reachability
        // than navigator.onLine ever is. Relay included: it is one of the slots.
        const previous = readyRef.current;
        const current = new Set(verifiedClouds);
        readyRef.current = current;

        for (const cid of previous) {
            if (!current.has(cid)) machine.outbox.setReady(cid, false);
        }
        for (const cid of current) {
            if (previous.has(cid)) continue;
            // Only on the rising edge: one attempt per ready transition is what keeps at most one
            // failed row per undelivered message (see outbox.ts).
            machine.outbox.setReady(cid, true);
            machine.sweep(cid).catch((error: unknown) => {
                // The channel list itself could not be read: no channel was swept. The next
                // ready-transition of this cloud sweeps again.
                logger.warn('CHAT', '[useChatOutbox] sweep failed; unsent messages wait for the next sweep', {
                    cid,
                    error,
                });
            });
        }
        // relayUid: a rebuilt machine starts with nothing ready and has to hear every cloud again.
    }, [verifiedClouds, relayUid]);
};
