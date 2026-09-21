import type { DomainSyncPlan, SyncFailureDecision, SyncFailureInfo } from '@lemoncloud/chatic-sockets-lib';
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    JoinSyncPlan,
    PlaceSyncPlan,
    ProfileSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import { toDomainChannel, toDomainChat, toDomainJoin, toDomainPlace, toDomainProfile } from '@chatic/data';
import { getDataManager, getRepositories } from '../../data/runtime';
import type { ChannelView, ProfileView } from '@lemoncloud/chatic-socials-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { isForeignContext } from '@chatic/data';
import { logger } from '@chatic/bridges';
import { foreignDropAggregator } from '@chatic/logger';

import { clearRefusedChannel, recordRefusedChannel } from './refusedChannels';

/**
 * Sync plans resolve runtime-heavy dependencies lazily so tests can inject
 * lightweight factories without loading the socket library at module scope.
 *
 * Domain mappers consume the shared DataContext directly (cid/sid/uid live on
 * it), so we read it straight from the manager instead of projecting a separate
 * scope object.
 */
const getContext = () => getDataManager().getContext();

/**
 * Common option for polling plans: don't reset the snapshot on reconnect (ADR-0059).
 *
 * The library's default is to reset — the first poll right after reconnect is then unconditionally
 * judged "changed", guaranteeing onUpdate fires at least once. Our consumers don't need that
 * guarantee: onUpdate only writes to the cache, and the cache already has the same row, so resetting
 * only produced, for every reconnect (which happens on every foreground return), one identical-data
 * write per registered target → rate limit → refetch chain. Keeping the snapshot writes only the
 * rows that actually changed while offline (updatedAt advanced). Session boundaries (cloud switch,
 * logout) are covered because the scheduler's `stopAll` clears the snapshot along with everything
 * else, so a stale baseline can't survive across a session.
 */
const KEEP_SNAPSHOT_ON_RECONNECT = { resetSnapshotOnConnected: false } as const;

/**
 * Logs a sync target's permanent stop, then lets the plan do what it does about it.
 *
 * **A stop is a deletion here.** The scheduler declares a target gone after two consecutive 403/404
 * and calls the plan's `onStopped`, and every library plan implements that by invoking the
 * `onRemove` we passed below — which tombstones the cache row, and for my own `join` also clears
 * that room's cached messages. So the destructive half already had a trigger (`onRemove`) and the
 * reason it fired had none: nothing distinguished "the server says I am not a member" from "the
 * server answered 404 twice", and the second one silently threw local data away.
 *
 * Logged BEFORE the original runs, because the original IS the deletion. If the removal throws, or
 * the app dies partway through it, the entry explaining what was about to happen is already out.
 *
 * Wrapped here rather than passed as an option because `onStopped` is not one — the library's plan
 * classes assign it themselves. One wrapper for all of them is also what stops a new plan from
 * being added without this.
 *
 * `kind` and `goneStreak` are the point of the entry: `gone` means the server answered 403/404,
 * `transient` means the scheduler gave up for some other reason, and those are different bugs.
 */
const reportStop = <TPlan extends DomainSyncPlan<any>>(plan: TPlan): TPlan => {
    const original = plan.onStopped?.bind(plan);

    plan.onStopped = (target, info: SyncFailureInfo, ctx) => {
        logger.error('SYNC', `sync target stopped — ${plan.domain}, local rows dropped`, {
            error: info.error,
            data: {
                domain: plan.domain,
                targetType: target.type,
                targetId: target.id,
                kind: info.kind,
                failures: info.failures,
                goneStreak: info.goneStreak,
            },
        });

        original?.(target, info, ctx);
    };

    return plan;
};

/**
 * The scheduler's stop rule, restated so a refusal can be observed without changing when it stops.
 *
 * Supplying `decide` REPLACES the library's default, so the default is reproduced here exactly —
 * stop once the server has said `gone` twice in a row, retry otherwise — with `stopAfter` pinned
 * beside it so the threshold and the formula that reads it cannot drift apart.
 *
 * **What a plan-level policy costs.** The scheduler resolves each field as
 * `plan.failurePolicy ?? scheduler.failurePolicy ?? built-in`, so pinning here wins over a
 * scheduler-level one. There is none to lose today and none can be configured:
 * `SyncRuntimeOptions` exposes keep-alive, reconnect, rotation, device-plan and the auth gate, and
 * nothing else reaches `createDeviceRuntime`. **If a scheduler-level failure policy is ever added,
 * this is the line that would silently ignore it for the channel plan.**
 */
const GONE_STOP_AFTER = 2;

/**
 * Remembers a channel the server refused, on the FIRST refusal.
 *
 * `onStopped` is too late to answer a screen: the scheduler reaches it only after the second
 * consecutive `gone`, a poll interval later, by which time the room has already spent its wait and
 * shown a load failure for something that was never a failure. `decide` sees every one, including
 * the first, so the verdict is recorded there and the decision handed back unchanged.
 *
 * Only `channel` targets are recorded, and only to answer "can this room be opened at all". The
 * `gone` classification is the library's, made from the socket's status code — this adds no reading
 * of its own.
 */
const reportRefusal = <TPlan extends DomainSyncPlan<any>>(plan: TPlan): TPlan => {
    const policy = plan.failurePolicy;
    Object.assign(plan, {
        failurePolicy: {
            ...policy,
            stopAfter: policy?.stopAfter ?? GONE_STOP_AFTER,
            decide: (info: SyncFailureInfo): SyncFailureDecision => {
                if (info.kind === 'gone' && info.target.type === 'channel' && info.target.id) {
                    recordRefusedChannel(info.target.id);
                }
                // A policy the plan already carried keeps its say; today no library plan sets one.
                if (policy?.decide) return policy.decide(info);
                const stopAfter = policy?.stopAfter ?? GONE_STOP_AFTER;
                return info.kind === 'gone' && info.goneStreak >= stopAfter ? 'stop' : 'retry';
            },
        },
    });
    return plan;
};

// DeviceSyncPlan is no longer created here: createDeviceRuntime injects its own
// DeviceSyncPlan and owns device save, so these plans are passed as `extraSyncPlans`.
//
// `getBoundCid` is injected rather than read from `socket/runtime`: importing the runtime here
// closed a cycle (`socket/runtime` → `SyncManager` → `plans` → `socket/runtime`). The owner already
// holds the manager — `SyncManager` passes its own accessor — so nothing needs the singleton.
export const createSyncPlans = (getBoundCid: () => string | null): DomainSyncPlan[] => {
    // A cloud switch flips the cache cid to the target optimistically, but the outgoing cloud's
    // socket stays attached (same url) until the target's wss commits — and keeps delivering frames.
    // getBoundCid() is the cloud that socket was actually bound to; when it differs from the live
    // cache cid the frame belongs to a socket that outlived its cloud, so drop it rather than write
    // the old cloud's channels under the new cloud's partition (the cross-cloud flicker).
    //
    // Read per frame, never captured: the bound cloud changes under a live plan.
    const dropForeignFrame = (): boolean => {
        const context = getContext();
        const socketCid = getBoundCid() ?? undefined;
        const foreign = isForeignContext({ ...context, socketCid });
        // Counted here rather than at each call site: this predicate is already the single gate, and
        // these fire on the poll cadence — per-frame logging is what the aggregator's window exists
        // to avoid (ADR-0099). `getBoundCid` stays the injected accessor; reaching for the socket
        // runtime here would close the cycle this signature exists to cut.
        if (foreign) {
            foreignDropAggregator.record({
                source: 'sync-frame',
                cid: context.cid ?? 'default',
                socketCid: socketCid ?? 'none',
            });
        }
        return foreign;
    };

    return [
        reportRefusal(
            reportStop(
                new ChannelSyncPlan<ChannelView>({
                    ...KEEP_SNAPSHOT_ON_RECONNECT,
                    onUpdate: (target, view) => {
                        // A view proves the channel is readable, which is the one thing that can
                        // retire a refusal: the membership behind it can come back (a re-invite
                        // restores the join), and a remembered "no" must not outlive it.
                        if (target.id) clearRefusedChannel(target.id);
                        if (dropForeignFrame()) return;
                        const { channel } = getRepositories();
                        void channel.cacheWrite(toDomainChannel(view, getContext()));
                    },
                    onRemove: target => {
                        if (!target.id) return;
                        const { channel } = getRepositories();
                        void channel.cacheDelete(target.id);
                    },
                })
            )
        ),
        // Place sync targets emit MySiteView payloads; parameterize the plan so
        // onUpdate's view matches toDomainPlace's input instead of the default
        // bare SyncableView (id/updatedAt only).
        reportStop(
            new PlaceSyncPlan<MySiteView>({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    if (dropForeignFrame()) return;
                    const { place } = getRepositories();
                    void place.cacheWrite(toDomainPlace(view, getContext()));
                },
                onRemove: target => {
                    if (!target.id) return;
                    const { place } = getRepositories();
                    void place.cacheDelete(target.id);
                },
            })
        ),
        reportStop(
            new ProfileSyncPlan<ProfileView>({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    if (dropForeignFrame()) return;
                    const { profile } = getRepositories();
                    void profile.cacheWrite(toDomainProfile(view, getContext()));
                },
                onRemove: target => {
                    if (!target.id) return;
                    const { profile } = getRepositories();
                    void profile.cacheDelete(target.id);
                },
            })
        ),
        // The chat plan hands off arrival (onApply) and change (onUpdate) separately. A chatNo we
        // don't know yet is a new message; a payload that arrives again for an already-resolved
        // chatNo is a change to that message (sockets-lib 0.5.1).
        // No onRemove is set — the chat plan is never auto-stopped, and message history is kept for
        // lazy-load/offline use.
        reportStop(
            new ChatSyncPlan({
                // Applied message delta (ascending). Written in one batch for an idempotent merge keyed on chatNo.
                onApply: (_target, applied) => {
                    if (dropForeignFrame()) return;
                    if (!applied.length) return;
                    const { chat } = getRepositories();
                    const scope = getContext();
                    void chat.cacheWriteMany(applied.map(view => toDomainChat(view, scope)));
                },
                /**
                 * An edit or delete made by someone else. Without this, a change that arrives through
                 * sync isn't reflected anywhere until the next `chat.feed` refetch — before 0.5.1 that
                 * path didn't even exist.
                 *
                 * **A delete is a write too.** `hidden: true` is what a delete is — the row isn't
                 * removed, it's written as-is. `ChatRepository.deleteChat` already does the same for a
                 * delete I make myself, and its comment records why: deleting it would let the row come
                 * back on the next sync, so a screen that renders a deleted message as a tombstone would
                 * show the same message as briefly-gone and then as a tombstone a second time. In other
                 * words, an incoming delete and a delete I make myself converge on the same state.
                 *
                 * This can also fire for a message that's been pushed out of the window, and the same
                 * change can repeat, so it writes keyed on id — `cacheWrite` behaves that way, so
                 * repeats are harmless.
                 */
                onUpdate: (_target, changed) => {
                    if (dropForeignFrame()) return;
                    const { chat } = getRepositories();
                    void chat.cacheWrite(toDomainChat(changed, getContext()));
                },
            })
        ),
        // join is a single-join polling plan. onUpdate is called when the join.get response's
        // updatedAt changes; this plan owns read-state sync, and JoinRepositoryV2 handles reflecting
        // it into the local cache.
        reportStop(
            new JoinSyncPlan({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    if (dropForeignFrame()) return;
                    const { join } = getRepositories();
                    void join.cacheWrite(toDomainJoin(view, getContext()));
                },
                // A removed join (membership dropped: leave/kick) tombstones the local cache row so
                // read-state observers (home unread, room read positions) stop counting it.
                onRemove: target => {
                    if (!target.id) return;
                    const { join, chat } = getRepositories();
                    void join.cacheDelete(target.id);

                    // When the dropped row is MINE, I am out of that room and its cached messages must
                    // go with it (ADR-0067). `leaveChannel` covers only the leave I initiate here; a
                    // kick or a leave from another device arrives as this removal and nothing else.
                    // Checked after the tombstone above, and only for the purge: clearing messages is
                    // not undoable, so a frame from a socket that outlived its cloud must not aim it at
                    // the live cloud's partition.
                    if (dropForeignFrame()) return;
                    const separator = target.id.lastIndexOf('@');
                    if (separator <= 0) return;
                    const channelId = target.id.slice(0, separator);
                    const userId = target.id.slice(separator + 1);
                    if (userId && userId === getContext().uid) void chat.cacheClearByChannelId(channelId);
                },
            })
        ),
    ];
};
