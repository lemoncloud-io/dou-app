import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';
import type { DomainChannel, IChatRepository } from '@chatic/data';

import {
    CATCH_UP_LIMIT,
    CATCH_UP_OLDER_CONCURRENCY,
    catchUpChannel,
    createPageGate,
    type PageGate,
} from './chatCatchUp';
import { readSelectedCloudId, useSelectedCloudId } from './useCloudScope';

/**
 * One reading of the newest cached chat number per channel. The repository offers it only as an
 * observation, so this takes the first answer and closes the subscription. A channel with no cached
 * row is absent from the map.
 */
export const readLastNos = (
    repository: Pick<IChatRepository, 'observeLastList'>,
    channelIds: string[]
): Promise<Map<string, number>> =>
    new Promise(resolve => {
        let answered = false;
        let closed = false;
        // Only ever called once `unsubscribe` is assigned: from a microtask, or after the call returns.
        const close = () => {
            if (closed) return;
            closed = true;
            unsubscribe();
        };
        const unsubscribe = repository.observeLastList(channelIds, rows => {
            if (answered) return;
            answered = true;
            resolve(new Map(rows.map(row => [row.channelId, row.lastNo])));
            // Closed after the callback returns, never from inside the observer's own emission.
            queueMicrotask(close);
        });
        if (answered) close();
    });

/**
 * Registers a chat (message) sync for every channel of the ACTIVE site, for as long as the caller is
 * mounted — the chat-domain sibling of {@link useJoinSyncRegistration}. `ChatSyncRunner` mounts it
 * once for the app, so it runs on every route.
 *
 * Why it exists: the home list only ever READS the chat cache (`useLastChats` is a pure observation),
 * so a row repaints when — and only when — something writes a newer message into that cache. Inside
 * a room `useChatSync` is that writer; for every other room nobody was, so the previews (and the
 * activity order derived from them) sat still until the room was opened. It ran only while home was
 * mounted, too, so a frame for another room that arrived while the reader was in a room or on another
 * tab was dropped; app-wide, the cache holds the place's rooms whatever screen is open, which is what
 * lets other readers of the cache — the notification inbox — trust it.
 *
 * Two mechanisms, because `ChatSyncPlan.run` is a no-op — registering alone loads nothing:
 *
 * 1. **Target registration** — a `chat` sync target per channel (`registerSyncTarget`). A `chat.sync` frame is
 *    dispatched to every registered chat target (each filters by its own channelId), so a message
 *    arriving in any of the site's channels is appended live, and a reconnect catches the target up
 *    from its baseline. A chat registration refcounts by key, so the room's own registration for the
 *    channel being viewed dedups into this one rather than doubling it.
 * 2. **Head-triggered catch-up** — a channel whose polled head (`channel.chatNo`, kept fresh by the
 *    per-row `useChannelSync` and the cloud-wide `syncChannels` delta) runs ahead of what the chat
 *    cache holds gets its newest page pulled, then older pages until they meet what the cache held
 *    ({@link catchUpChannel}, bounded). This is the convergence guarantee: it does not care whether
 *    the push was delivered, missed, or scoped away, and it fires only for channels that genuinely
 *    moved — a warm list costs nothing.
 *
 * The catch-up deliberately lives HERE, in a sync-registration hook, and not in the list component:
 * the list must stay a pure cache read so rendering a row can never be the thing that makes a
 * network call.
 *
 * When the cache is read: once for every room when the hook starts, then once for a room each time its
 * head moves — never on a chat write. Held open as an observation, the last-chat reading would wake on
 * every chat write anywhere and re-read every room's tail, which home could afford while it alone ran
 * this and an app-wide hook cannot: a busy open room would pay it for each message.
 *
 * Baseline: the same reading aligns the plan's `lastNo`. Without it the first push after a cold start
 * reads as a gap and re-fetches the newest page per channel. Only `lastNo` is patched — the plan
 * merges the patch over its snapshot, so an open room's message window is left intact.
 *
 * Cloud: the targets and the baselines are the selected cloud's, named explicitly, and both wait for
 * that cloud's own slot. A reading is applied only while the selection is still the cloud it was taken
 * in — a switch landing between the read and its answer would otherwise push one cloud's `lastNo` into
 * the next cloud's plan, where it reads as "already have everything up to here" for a channel that
 * does not exist there. The catch-up writes through the cloud's own repositories for the same reason.
 *
 * Not closed: a hole whose newest rows reached the cache before the head moved (a reconnect's own
 * catch-up wrote them), and a walk cut short by a switch or a failed page. The head it was started for
 * is spent, so neither is walked again until the room is opened.
 */
export const useChatSyncRegistration = (
    channels: DomainChannel[],
    { enabled = true }: { enabled?: boolean } = {}
): void => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const cid = useSelectedCloudId();
    const cloudVerified = runtime.connection.useCloudVerified(cid);
    // A target only runs while the uid it was tagged with is still the account's uid in its cloud,
    // so an account change retires it — re-register on it, as `useSyncTarget` does.
    const uid = runtime.session.useUidInCloud(cid);
    // The latest uid, for a catch-up walk to notice an account change that lands while it pages.
    const uidRef = useRef(uid);
    uidRef.current = uid;
    const channelsRef = useRef(channels);
    channelsRef.current = channels;
    // One gate for every room's older pages, so a long absence does not put them all on the socket.
    const olderGateRef = useRef<PageGate | null>(null);
    olderGateRef.current ??= createPageGate(CATCH_UP_OLDER_CONCURRENCY);

    // Sorted-and-joined key: a reorder (pin / activity sort) must not re-register or re-read.
    const channelKey = [...channels.map(channel => channel.id).filter(Boolean)].sort().join(',');
    // The same, with each room's head: what changes when a room gains a row.
    const headKey = channels
        .filter(channel => !!channel.id)
        .map(channel => `${channel.id}:${channel.chatNo ?? 0}`)
        .sort()
        .join(',');

    useEffect(() => {
        if (!enabled || !cloudVerified || !channelKey) return;
        const disposers = channelKey
            .split(',')
            .map(id => runtime.sync.registerSyncTarget({ type: 'chat', id }, { cid }));
        return () => disposers.forEach(dispose => dispose());
    }, [channelKey, enabled, cloudVerified, cid, uid]);

    // The head each room was last read for. A room is read again only once its head is past this.
    const checkedNoRef = useRef(new Map<string, number>());
    // Heads already fetched for, per channel — one head fires at most one walk, even when the
    // response cannot advance lastNo (every new row a reaction or a thread reply).
    const requestedNoRef = useRef(new Map<string, number>());

    useEffect(() => {
        checkedNoRef.current.clear();
        requestedNoRef.current.clear();
    }, [cid, uid]);

    useEffect(() => {
        if (!enabled || !cloudVerified || !isVerified || !headKey) return;
        const checked = checkedNoRef.current;
        const due = channelsRef.current.flatMap(channel => {
            const id = channel.id;
            const head = channel.chatNo ?? 0;
            if (!id) return [];
            const last = checked.get(id);
            return last !== undefined && head <= last ? [] : [{ id, head }];
        });
        if (due.length === 0) return;
        for (const { id, head } of due) checked.set(id, head);
        // The app graph reads the partition of the selection as it is now, which a render can lag.
        const readCid = readSelectedCloudId();

        const startCatchUp = (channelId: string, knownNo: number) => {
            const walkUid = uidRef.current;
            const gate = olderGateRef.current as PageGate;
            const { chat } = runtime.data.getCloudRepositories(readCid);
            void catchUpChannel({
                knownNo,
                // Not the room feed the room's own entry shares: that asks for the server's default of
                // 20, and a room opened on fewer than two screens of rows asks for an older page at once.
                fetchNewest: () => chat.refreshList({ channelId, limit: CATCH_UP_LIMIT }),
                // The cursor is a number the previous page counted, so the head is at or above it.
                fetchOlder: (cursorNo, limit) =>
                    gate(() => chat.refreshList({ channelId, cursorNo, limit }, { cursorIsRow: true })),
                // Pages for a cloud or an account the session has left are of no use to it any more.
                shouldContinue: () => readSelectedCloudId() === readCid && uidRef.current === walkUid,
            }).catch(() => undefined);
        };

        void readLastNos(
            chatRepository,
            due.map(({ id }) => id)
        ).then(lastNos => {
            if (readCid !== cid || readSelectedCloudId() !== readCid) {
                // Read in a cloud the session has left: none of it applies. The next run reads again.
                for (const { id, head } of due) if (checked.get(id) === head) checked.delete(id);
                return;
            }
            for (const { id, head } of due) {
                const known = lastNos.get(id);
                if (known !== undefined) {
                    runtime.sync.updateSyncSnapshot({ type: 'chat', id }, { id, lastNo: known }, { cid: readCid });
                }
                const knownNo = known ?? 0;
                if (head <= knownNo || head <= (requestedNoRef.current.get(id) ?? 0)) continue;
                requestedNoRef.current.set(id, head);
                startCatchUp(id, knownNo);
            }
        });
    }, [headKey, enabled, cloudVerified, isVerified, cid, chatRepository]);
};
