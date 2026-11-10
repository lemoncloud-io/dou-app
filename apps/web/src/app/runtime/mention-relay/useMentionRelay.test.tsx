import { act, renderHook } from '@testing-library/react';
import { useMentionRelay, useRelaySelfMention } from './useMentionRelay';
import { publishRelaySelfMention } from './selfMentionState';
import type { RelaySnapshot } from './relay';

const mockOffer = jest.fn();
jest.mock('./devRelay', () => ({ offerMentionRelay: (...args: unknown[]) => mockOffer(...args) }));
const snapshot: RelaySnapshot = {
    cloudId: 'cloud',
    channelId: 'public-id',
    channelName: 'public',
    viewerIds: ['me'],
    roomUserId: 'me',
    membership: { joinedNo: 0 },
    ready: true,
    rows: [],
};
const flags = globalThis as typeof globalThis & { __DOU_MENTION_RELAY_ENABLED__?: boolean };
afterEach(() => {
    publishRelaySelfMention(null);
    delete flags.__DOU_MENTION_RELAY_ENABLED__;
    jest.clearAllMocks();
});

describe('mention relay build gate', () => {
    it('does not load the development integration in a normal build', async () => {
        const hook = renderHook(() => useMentionRelay(snapshot));
        await act(async () => undefined);
        hook.rerender();
        expect(mockOffer).not.toHaveBeenCalled();
    });
    it('only offers a ready snapshot when explicitly compiled on', async () => {
        flags.__DOU_MENTION_RELAY_ENABLED__ = true;
        const hook = renderHook(({ ready }) => useMentionRelay({ ...snapshot, ready }), {
            initialProps: { ready: false },
        });
        await act(async () => undefined);
        expect(mockOffer).not.toHaveBeenCalled();
        hook.rerender({ ready: true });
        await act(async () => undefined);
        expect(mockOffer).toHaveBeenCalledWith(snapshot);
    });
});

describe('self-mention candidate scope', () => {
    it('requires the enabled build and a successful exact-scope publication', () => {
        const hook = renderHook(({ cloudId, channelId, userId }) => useRelaySelfMention(cloudId, channelId, userId), {
            initialProps: { cloudId: 'cloud', channelId: 'public-id', userId: 'me' },
        });
        act(() => publishRelaySelfMention(snapshot));
        expect(hook.result.current).toBe(false);
        flags.__DOU_MENTION_RELAY_ENABLED__ = true;
        hook.rerender({ cloudId: 'cloud', channelId: 'public-id', userId: 'me' });
        expect(hook.result.current).toBe(true);
        hook.rerender({ cloudId: 'other-cloud', channelId: 'public-id', userId: 'me' });
        expect(hook.result.current).toBe(false);
        hook.rerender({ cloudId: 'cloud', channelId: 'private-id', userId: 'me' });
        expect(hook.result.current).toBe(false);
        hook.rerender({ cloudId: 'cloud', channelId: 'public-id', userId: 'other-user' });
        expect(hook.result.current).toBe(false);
        hook.rerender({ cloudId: 'cloud', channelId: 'public-id', userId: 'me' });
        act(() => publishRelaySelfMention(null));
        expect(hook.result.current).toBe(false);
    });
});
