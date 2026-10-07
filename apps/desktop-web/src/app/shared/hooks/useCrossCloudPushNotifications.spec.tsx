import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook, waitFor } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let pushHandler: ((message: unknown) => void) | null = null;
const request = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock('@chatic/bridges', () => ({
    webClient: {
        request,
        onEvent: (_type: string, handler: (message: unknown) => void) => {
            pushHandler = handler;
            return () => undefined;
        },
    },
}));

vi.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: () => ({
                identity: { userId: ACCOUNT_UID },
                activeServer: { kind: 'relay' },
            }),
        },
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    readCacheRecords: async () => [],
    resolveMyMentionNames: () => ['Me'],
}));

import { useNotificationPrefsStore } from '../stores';
import { useCrossCloudPushNotifications } from './useCrossCloudPushNotifications';

const push = (data: Record<string, string>) => ({
    data: {
        notification: {
            title: 'general',
            body: 'hello',
            data: { channelId: 'ch-1', channelName: 'general', ownerId: 'someone-else', uid: CLOUD_UID, ...data },
        },
    },
});

const shown = () => toast.mock.calls.length + request.mock.calls.length;

beforeEach(() => {
    vi.clearAllMocks();
    request.mockResolvedValue(undefined);
    pushHandler = null;
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

    // The push carries the owner as the cloud's own user id; `data.uid` is the recipient in that
    // same id space, so an owner equal to it is me.
    it('drops a push for my own message identified by my per-cloud user id', async () => {
        pushHandler?.(push({ ownerId: CLOUD_UID }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(shown()).toBe(0);
    });
});
