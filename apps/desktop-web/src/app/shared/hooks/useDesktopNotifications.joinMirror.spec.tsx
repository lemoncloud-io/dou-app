import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, renderHook } from '@testing-library/react';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

type Emit = (result: { list: unknown[] }) => void;

let emitChannels: Emit | null = null;
const joinEmitters = new Map<string, Emit>();

let native = true;

vi.mock('@chatic/bridges', () => ({
    isNative: () => native,
    webClient: { request: vi.fn() },
}));

vi.mock('@chatic/app-runtime', () => {
    // One object for every render: the hook's effect depends on the repositories' identity.
    const repositories = {
        channel: {
            observeList: (_query: unknown, onChange: Emit) => {
                emitChannels = onChange;
                return () => undefined;
            },
        },
        join: {
            observeList: ({ channelId }: { channelId: string }, onChange: Emit) => {
                joinEmitters.set(channelId, onChange);
                return () => joinEmitters.delete(channelId);
            },
        },
    };
    return {
        runtime: {
            data: { useRuntimeRepositories: () => repositories },
            connection: { useRuntimeSocketState: () => ({ isVerified: true }) },
            session: { useSessionIdentity: () => ({ userId: ACCOUNT_UID }) },
        },
    };
});

vi.mock('./usePlaces', () => {
    const places = [{ id: 'place-1' }];
    return { usePlaces: () => ({ places }) };
});

vi.mock('./useChannelChatFeeds', () => ({ useChannelChatFeeds: () => undefined }));

import { useNotificationPrefsStore } from '../stores';
import { useDesktopNotifications } from './useDesktopNotifications';

const levelOf = (channelId: string) => useNotificationPrefsStore.getState().channelNotify[channelId];

// Another device changes the level; it reaches this one as a write to the join cache.
describe('useDesktopNotifications join mirror', () => {
    const start = (joinUserId: string | null = CLOUD_UID) => {
        renderHook(() => useDesktopNotifications());
        const $join = joinUserId ? { userId: joinUserId } : undefined;
        act(() => emitChannels?.({ list: [{ id: 'ch-1', sid: 'place-1', $join }] }));
    };

    beforeEach(() => {
        native = true;
        emitChannels = null;
        joinEmitters.clear();
        useNotificationPrefsStore.setState({ channelNotify: {}, mutedChannels: {} });
    });

    const emitJoins = (list: unknown[]) => act(() => joinEmitters.get('ch-1')?.({ list }));

    // Until the channel says who I am in its cloud, my account id is what there is to go by.
    it('takes the level of my join under my account id while my id in the cloud is unknown', () => {
        start(null);
        emitJoins([{ channelId: 'ch-1', userId: ACCOUNT_UID, notify: 'none' }]);

        expect(levelOf('ch-1')).toBe('none');
    });

    // Outside the relay my join in a channel is under the id that cloud gave me, not my account id.
    it("takes the level of my join when the join is under my id in the channel's cloud", () => {
        start();
        emitJoins([{ channelId: 'ch-1', userId: CLOUD_UID, notify: 'mention' }]);

        expect(levelOf('ch-1')).toBe('mention');
    });

    it("leaves my level alone for a join that is someone else's", () => {
        start();
        emitJoins([{ channelId: 'ch-1', userId: 'u-other', notify: 'none' }]);

        expect(levelOf('ch-1')).toBeUndefined();
    });

    // The level is the app's own state, not the shell's: the channel list reads it in a browser too.
    it('takes the level outside the desktop shell too', () => {
        native = false;
        start();
        emitJoins([{ channelId: 'ch-1', userId: CLOUD_UID, notify: 'none' }]);

        expect(levelOf('ch-1')).toBe('none');
    });

    // Should a cloud hand someone else the id that is my account's, the join under my id there is mine.
    it("goes by my id in the channel's cloud over a join under my account id", () => {
        start();
        emitJoins([
            { channelId: 'ch-1', userId: ACCOUNT_UID, notify: 'none' },
            { channelId: 'ch-1', userId: CLOUD_UID, notify: 'mention' },
        ]);

        expect(levelOf('ch-1')).toBe('mention');
    });
});
