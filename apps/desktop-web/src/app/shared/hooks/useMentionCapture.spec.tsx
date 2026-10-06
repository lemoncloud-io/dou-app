import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@testing-library/react';

import type * as UtilsModule from '../utils';

const ACCOUNT_UID = 'acct-1';
const CLOUD_UID = 'cloud-user-9';

let feedHandler: ((feed: unknown) => void) | null = null;

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            getGlobalSessionContext: () => ({ identity: { userId: ACCOUNT_UID } }),
        },
    },
}));

vi.mock('./useChannelChatFeeds', () => ({
    useChannelChatFeeds: (handler: (feed: unknown) => void) => {
        feedHandler = handler;
    },
}));

vi.mock('../utils', async () => ({
    ...(await vi.importActual<typeof UtilsModule>('../utils')),
    resolveMyMentionNames: () => ['Me'],
}));

import { useMentionsStore, useReadCursorStore } from '../stores';
import { useMentionCapture } from './useMentionCapture';

const channel = (joinUserId?: string) => ({ id: 'ch-1', $join: joinUserId ? { userId: joinUserId } : undefined });

const feed = (chat: Record<string, unknown>, joinUserId: string | null = CLOUD_UID) => ({
    placeId: 'place-1',
    channel: channel(joinUserId ?? undefined),
    chat: { id: 'ch-1:5', chatNo: 5, content: 'hello @Me', ownerId: 'someone-else', ...chat },
});

const captured = () => Object.values(useMentionsStore.getState().items);

beforeEach(() => {
    feedHandler = null;
    useMentionsStore.setState({ items: {} });
    useReadCursorStore.setState({ cursors: {} });
    renderHook(() => useMentionCapture());
});

describe('useMentionCapture', () => {
    it('captures a mention written by someone else', () => {
        feedHandler?.(feed({}));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);
    });

    it('skips my own message identified by my account id', () => {
        feedHandler?.(feed({ ownerId: ACCOUNT_UID }));
        expect(captured()).toEqual([]);
    });

    // Outside the relay a persisted message's owner is the per-cloud user id, not the account uid.
    it('skips my own message identified by my per-channel cloud user id', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID }));
        expect(captured()).toEqual([]);
    });

    it('skips my own message when the embedded owner carries my cloud user id', () => {
        feedHandler?.(feed({ ownerId: undefined, owner$: { id: CLOUD_UID, name: 'Me' } }));
        expect(captured()).toEqual([]);
    });

    it('compares only my account id when the channel has no join of mine', () => {
        feedHandler?.(feed({ ownerId: CLOUD_UID }, null));
        expect(captured().map(item => item.id)).toEqual(['ch-1:5']);

        useMentionsStore.setState({ items: {} });
        feedHandler?.(feed({ ownerId: ACCOUNT_UID }, null));
        expect(captured()).toEqual([]);
    });

    it('skips a row without an id instead of storing it', () => {
        feedHandler?.(feed({ id: undefined }));
        expect(captured()).toEqual([]);
    });
});
