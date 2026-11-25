import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID, toMentionBody, runtime } from '@chatic/runtime-react';
import type { ChatSendPayload, DomainChat } from '@chatic/runtime-react';

const SWEEP_LIMIT = 200;
const LANDING_PAGE_LIMIT = 50;
const LANDING_SKEW_MS = 5 * 60_000;

let outboxSingleton: runtime.data.ChatOutbox | null = null;

export const getChatOutbox = (): runtime.data.ChatOutbox | null => outboxSingleton;

export type SendableChat = DomainChat & { content: string };

const rowTime = (row: DomainChat): number => row.createdAtMs ?? row.createdAt ?? 0;

export const selectResendableRows = (rows: DomainChat[], myUid: string): SendableChat[] =>
    rows
        .filter((row): row is SendableChat => !!row.isFailed && !!row.id && !!row.content && row.ownerId === myUid)
        .sort((left, right) => rowTime(left) - rowTime(right));

const resolveParentId = (row: DomainChat): string | undefined => {
    if (!row.parentId) return undefined;
    return row.parentId.includes(':') ? row.parentId : `${row.channelId}:${row.parentId}`;
};

export const toSendPayload = (row: SendableChat): ChatSendPayload => {
    const mention = toMentionBody(row.mention$);
    return {
        channelId: row.channelId,
        content: row.content,
        contentType: row.contentType,
        parentId: resolveParentId(row),
        ...(mention ? { mention } : {}),
    };
};

export interface LandingQuery {
    channelId: string;
    content: string;
    myUid: string;
    sentAt: number;
}

export const matchLandedRow = (rows: DomainChat[], query: LandingQuery, consumed: Set<string>): DomainChat | null => {
    const candidates = rows
        .filter(
            row =>
                !!row.id &&
                !consumed.has(row.id) &&
                (row.chatNo ?? 0) > 0 &&
                row.channelId === query.channelId &&
                row.content === query.content &&
                row.ownerId === query.myUid &&
                Math.abs(rowTime(row) - query.sentAt) <= LANDING_SKEW_MS
        )
        .sort((left, right) => rowTime(left) - rowTime(right));

    return candidates[0] ?? null;
};

export interface LandingBatch {
    record(entryId: string, sentAt: number): void;
    match(rows: DomainChat[], entry: runtime.data.OutboxEntry, myUid: string): DomainChat | null;
    commit(entryId: string): void;
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

export interface CloudOutboxDeps {
    repositoriesOf(cid: string): Pick<runtime.data.PageRepositories, 'chat' | 'channel'>;
    sendInCloud(cid: string, payload: ChatSendPayload): Promise<unknown>;
    uidOf(cid: string): string | null;
}

export interface CloudOutbox {
    outbox: runtime.data.ChatOutbox;
    sweep(cid: string): Promise<void>;
}

export const createCloudOutbox = ({ repositoriesOf, sendInCloud, uidOf }: CloudOutboxDeps): CloudOutbox => {
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
        discard: async entry => {
            await repositoriesOf(entry.cid).chat.cacheDelete(entry.id);
            batchOf(entry.cid).commit(entry.id);
        },
        send: async entry => {
            await repositoriesOf(entry.cid).chat.cacheDelete(entry.id);
            await sendInCloud(entry.cid, entry.payload);
        },
    });

    const sweep = async (cid: string): Promise<void> => {
        if (outbox.pending(cid).length) return;
        const myUid = uidOf(cid);
        if (!myUid) return;
        const { chat: chatRepository, channel: channelRepository } = repositoriesOf(cid);
        const batch = batchOf(cid);

        const channels = await channelRepository.cacheReadList({ sid: '' });
        const channelIds = (channels?.list ?? []).map(channel => channel.id).filter((id): id is string => !!id);

        const perChannel = await Promise.all(
            channelIds.map(channelId =>
                chatRepository
                    .cacheReadList({ channelId, cursorNo: 1, limit: SWEEP_LIMIT })
                    .then(result => ({ channelId, rows: result?.list ?? [], failure: undefined as unknown }))
                    .catch((failure: unknown) => ({ channelId, rows: [] as DomainChat[], failure: failure ?? true }))
            )
        );

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
                batch.record(row.id, rowTime(row));
                swept.add(row.id);
                outbox.enqueue({ id: row.id, cid, channelId, payload: toSendPayload(row) });
            }
        }
        batch.forget(swept);
    };

    return { outbox, sweep };
};

export const useChatOutbox = (): void => {
    const relayUid = runtime.session.useUidInCloud(RELAY_CLOUD_ID);
    const verifiedClouds = runtime.connection.useVerifiedClouds();

    const machineRef = useRef<CloudOutbox | null>(null);
    const readyRef = useRef<ReadonlySet<string>>(new Set());

    useEffect(() => {
        const machine = createCloudOutbox({
            repositoriesOf: runtime.data.getCloudRepositories,
            sendInCloud: runtime.data.sendChatInCloud,
            uidOf: runtime.session.getUidInCloud,
        });
        machineRef.current = machine;
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

        const previous = readyRef.current;
        const current = new Set(verifiedClouds);
        readyRef.current = current;

        for (const cid of previous) {
            if (!current.has(cid)) machine.outbox.setReady(cid, false);
        }
        for (const cid of current) {
            if (previous.has(cid)) continue;
            machine.outbox.setReady(cid, true);
            machine.sweep(cid).catch((error: unknown) => {
                logger.warn('CHAT', '[useChatOutbox] sweep failed; unsent messages wait for the next sweep', {
                    cid,
                    error,
                });
            });
        }
    }, [verifiedClouds, relayUid]);
};
