import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let pushHandler: ((payload: unknown) => void) | null = null;
const present = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const readRecords = vi.hoisted(() => vi.fn());
let cacheRecords: unknown[] = [];
let activeServer: { kind: 'relay' } | { kind: 'cloud'; cloudId: string } = { kind: 'relay' };

vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

vi.mock('@chatic/runtime-react', async () => {
    const { browserPush, fakeRuntimeModule } = await import('@chatic/runtime-react/testing');
    return fakeRuntimeModule({
        session: {
            getGlobalSessionContext: () => ({
                identity: { userId: ACCOUNT_UID },
                activeServer,
            }),
        },
        push: {
            ...browserPush(),
            kind: 'shell',
            notifications: {
                onReceive: (listener: (payload: unknown) => void) => {
                    pushHandler = listener;
                    return () => undefined;
                },
            },
            localBanner: { present },
        },
    });
});

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    readCacheRecords: () => readRecords(),
    resolveMyMentionNames: () => ['Me'],
}));

import { parsePushDeeplink } from '../utils';
import { useNotificationPrefsStore, usePendingOpenStore } from '../stores';
import { useCrossCloudPushNotifications } from './useCrossCloudPushNotifications';

const push = (data: Record<string, string>) => ({
    notification: {
        title: 'general',
        body: 'hello',
        data: { channelId: 'ch-1', channelName: 'general', ownerId: 'someone-else', uid: CLOUD_UID, ...data },
    },
});

const shown = () => toast.mock.calls.length + present.mock.calls.length;

beforeEach(() => {
    vi.clearAllMocks();
    readRecords.mockImplementation(async () => cacheRecords);
    pushHandler = null;
    cacheRecords = [];
    activeServer = { kind: 'relay' };
    usePendingOpenStore.setState({ target: null });
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    useNotificationPrefsStore.setState({
        desktopEnabled: true,
        mutedChannels: {},
        channelNotify: {},
        snoozeUntil: null,
        quietHours: null,
    });
    renderHook(() => useCrossCloudPushNotifications());
});

describe('useCrossCloudPushNotifications', () => {
    it('presents a push for a message from someone else', async () => {
        pushHandler?.(push({}));
        await waitFor(() => expect(shown()).toBe(1));
    });

    it('drops a push for my own message identified by my account id', async () => {
        pushHandler?.(push({ ownerId: ACCOUNT_UID }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(shown()).toBe(0);
    });

    it('drops a push for my own message identified by my per-cloud user id', async () => {
        pushHandler?.(push({ ownerId: CLOUD_UID }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(shown()).toBe(0);
    });

    it('presents a push for a webhook message even when its owner id is mine', async () => {
        pushHandler?.(push({ ownerId: CLOUD_UID, stereo: 'webhook' }));
        await waitFor(() => expect(shown()).toBe(1));
    });

    describe("a 1:1's push", () => {
        const dmPush = () => push({ channelId: 'P2@me@peer', cid: 'cloud-9', sid: 'P1' });

        beforeEach(() => {
            cacheRecords = [
                {
                    type: 'channel',
                    cid: 'cloud-9',
                    data: { id: 'P2@me@peer', sid: 'P2', stereo: 'dm', $join: { userId: CLOUD_UID } },
                },
            ];
        });

        afterEach(() => vi.restoreAllMocks());

        it("opens the banner click on the room's place", async () => {
            vi.spyOn(document, 'hasFocus').mockReturnValue(false);
            pushHandler?.(dmPush());

            await waitFor(() => expect(present).toHaveBeenCalled());
            const deeplink = present.mock.calls[0][0].deeplink as string;
            expect(parsePushDeeplink(deeplink)).toMatchObject({ placeId: 'P2', channelId: 'P2@me@peer' });
        });

        it("opens the toast click on the room's place", async () => {
            vi.spyOn(document, 'hasFocus').mockReturnValue(true);
            pushHandler?.(dmPush());

            await waitFor(() => expect(toast).toHaveBeenCalled());
            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'P2', channelId: 'P2@me@peer' });
        });

        it("keeps a group channel's push on the place it names", async () => {
            cacheRecords = [];
            vi.spyOn(document, 'hasFocus').mockReturnValue(true);
            pushHandler?.(push({ channelId: '1000006', cid: 'cloud-9', sid: 'P1' }));

            await waitFor(() => expect(toast).toHaveBeenCalled());
            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ placeId: 'P1', channelId: '1000006' });
        });
    });

    describe('in quiet hours', () => {
        beforeEach(() => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 14, 23, 0));
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('stays silent with the mention breakthrough on', async () => {
            useNotificationPrefsStore.setState({
                quietHours: { start: '22:00', end: '07:00' },
                mentionBreaksQuietHours: true,
            });
            pushHandler?.(push({ content: 'hello @Me' }));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(shown()).toBe(0);
        });
    });

    describe('for a channel set to mentions only', () => {
        it('presents a push the server already filtered, though the text does not have my name', async () => {
            cacheRecords = [
                {
                    type: 'channel',
                    cid: 'cloud-9',
                    data: { id: 'ch-1', $join: { userId: CLOUD_UID, notify: 'mention' } },
                },
            ];
            pushHandler?.(push({ content: '@Nickname hello' }));
            await waitFor(() => expect(shown()).toBe(1));
        });

        it('presents every push of a 1:1 that this device left on mentions only', async () => {
            cacheRecords = [
                { type: 'channel', cid: 'cloud-9', data: { id: 'ch-1', stereo: 'dm', $join: { userId: CLOUD_UID } } },
            ];
            useNotificationPrefsStore.setState({ channelNotify: { 'ch-1': 'mention' } });
            pushHandler?.(push({ content: 'hello there' }));
            await waitFor(() => expect(shown()).toBe(1));
        });

        it("still reads the text when the mode is only this device's", async () => {
            useNotificationPrefsStore.setState({ channelNotify: { 'ch-1': 'mention' } });
            pushHandler?.(push({ content: 'hello there' }));
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(shown()).toBe(0);

            pushHandler?.(push({ content: 'hello @Me' }));
            await waitFor(() => expect(shown()).toBe(1));
        });
    });
    describe('for a relay push', () => {
        const relayPush = () => push({ cid: '#', sid: 'relay-site' });
        const focus = () => vi.spyOn(document, 'hasFocus').mockReturnValue(true);

        it('opens the channel on the relay, with no place, when the toast is clicked', async () => {
            focus();
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            pushHandler?.(relayPush());
            await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({
                cloudId: 'default',
                placeId: '',
                channelId: 'ch-1',
            });
        });

        it('banners with a link to the relay while another cloud is open', async () => {
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            pushHandler?.(relayPush());
            await waitFor(() => expect(present).toHaveBeenCalledTimes(1));

            expect(parsePushDeeplink(present.mock.calls[0][0].deeplink)).toMatchObject({
                cloudId: 'default',
                placeId: '',
                channelId: 'ch-1',
            });
        });

        const settle = async () => {
            await waitFor(() => expect(readRecords).toHaveBeenCalled());
            await new Promise(resolve => setTimeout(resolve, 20));
        };

        it('does not banner a second time while the relay is open', async () => {
            pushHandler?.(relayPush());
            await settle();
            expect(shown()).toBe(0);
        });

        it('banners a push only guessed to be from the open relay', async () => {
            cacheRecords = [{ type: 'channel', cid: 'default', data: { id: 'ch-1', $join: { userId: CLOUD_UID } } }];
            pushHandler?.(push({}));
            await waitFor(() => expect(present).toHaveBeenCalledTimes(1));
        });

        it("honours the server's mute for a relay channel", async () => {
            activeServer = { kind: 'cloud', cloudId: 'cloud-9' };
            cacheRecords = [{ type: 'channel', cid: 'default', data: { id: 'ch-1', $join: { notify: 'none' } } }];
            pushHandler?.(relayPush());
            await settle();
            expect(shown()).toBe(0);
        });

        it("keeps a cloud push's place", async () => {
            focus();
            pushHandler?.(push({ cid: 'cloud-9', sid: 'place-3' }));
            await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

            toast.mock.calls[0][0].onClick();
            expect(usePendingOpenStore.getState().target).toMatchObject({ cloudId: 'cloud-9', placeId: 'place-3' });
        });
    });
});
