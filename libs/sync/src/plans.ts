import type { DomainSyncPlan, SyncFailureDecision, SyncFailureInfo } from '@lemoncloud/chatic-sockets-lib';
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    JoinSyncPlan,
    PlaceSyncPlan,
    ProfileSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import { toDomainChannel, toDomainChat, toDomainJoin, toDomainPlace, toDomainProfile } from '@chatic/data';
import { syncDataGraph } from './dataGraph';
import type { ChannelView, ChatView, ProfileView } from '@lemoncloud/chatic-socials-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { logger } from '@chatic/logger';

import type { SlotKey } from '@chatic/transport';
import { clearRefusedChannel, recordRefusedChannel } from './refusedChannels';

const KEEP_SNAPSHOT_ON_RECONNECT = { resetSnapshotOnConnected: false } as const;

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

const persist = (what: string, write: () => unknown): void => {
    void (async () => write())().catch((error: unknown) => {
        logger.error('SYNC', `cache write failed — ${what}`, { error, data: { what } });
    });
};

const GONE_STOP_AFTER = 2;

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
                if (policy?.decide) return policy.decide(info);
                const stopAfter = policy?.stopAfter ?? GONE_STOP_AFTER;
                return info.kind === 'gone' && info.goneStreak >= stopAfter ? 'stop' : 'retry';
            },
        },
    });
    return plan;
};

export const createSyncPlans = (slot: SlotKey): DomainSyncPlan[] => {
    const cid: string = slot;
    const getRepositories = () => syncDataGraph.get().getScopedRepositories(cid);
    const getContext = () => syncDataGraph.get().getScopedContext(cid);

    return [
        reportRefusal(
            reportStop(
                new ChannelSyncPlan<ChannelView>({
                    ...KEEP_SNAPSHOT_ON_RECONNECT,
                    onUpdate: (target, view) => {
                        if (target.id) clearRefusedChannel(target.id);
                        const { channel } = getRepositories();
                        persist('channel update', () => channel.cacheWrite(toDomainChannel(view, getContext())));
                    },
                    onRemove: target => {
                        const { id } = target;
                        if (!id) return;
                        const { channel } = getRepositories();
                        persist('channel remove', () => channel.cacheDelete(id));
                    },
                })
            )
        ),
        reportStop(
            new PlaceSyncPlan<MySiteView>({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    const { place } = getRepositories();
                    persist('place update', () => place.cacheWrite(toDomainPlace(view, getContext())));
                },
                onRemove: target => {
                    const { id } = target;
                    if (!id) return;
                    const { place } = getRepositories();
                    persist('place remove', () => place.cacheDelete(id));
                },
            })
        ),
        reportStop(
            new ProfileSyncPlan<ProfileView>({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    const { profile } = getRepositories();
                    persist('profile update', () => profile.cacheWrite(toDomainProfile(view, getContext())));
                },
                onRemove: target => {
                    const { id } = target;
                    if (!id) return;
                    const { profile } = getRepositories();
                    persist('profile remove', () => profile.cacheDelete(id));
                },
            })
        ),
        reportStop(
            new ChatSyncPlan<ChatView>({
                onApply: (_target, applied) => {
                    if (!applied.length) return;
                    const { chat } = getRepositories();
                    const scope = getContext();
                    persist('chat apply', () => chat.cacheWriteMany(applied.map(view => toDomainChat(view, scope))));
                },
                onUpdate: (_target, changed) => {
                    const { chat } = getRepositories();
                    persist('chat update', () => chat.cacheWrite(toDomainChat(changed, getContext())));
                },
            })
        ),
        reportStop(
            new JoinSyncPlan({
                ...KEEP_SNAPSHOT_ON_RECONNECT,
                onUpdate: (_target, view) => {
                    const { join } = getRepositories();
                    persist('join update', () => join.cacheWrite(toDomainJoin(view, getContext())));
                },
                onRemove: target => {
                    const { id } = target;
                    if (!id) return;
                    const { join, chat } = getRepositories();
                    persist('join remove', () => join.cacheDelete(id));

                    const separator = id.lastIndexOf('@');
                    if (separator <= 0) return;
                    const channelId = id.slice(0, separator);
                    const userId = id.slice(separator + 1);
                    if (userId && userId === getContext().uid) {
                        persist('chat clear on leave', () => chat.cacheClearByChannelId(channelId));
                    }
                },
            })
        ),
    ];
};
