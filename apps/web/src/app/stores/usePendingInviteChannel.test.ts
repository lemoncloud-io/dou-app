import { usePendingInviteChannel } from './usePendingInviteChannel';

const KEY = 'chatic.invite.pending-channel';

const stored = (): unknown => {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw).state : null;
};

beforeEach(() => {
    sessionStorage.clear();
    usePendingInviteChannel.setState({ channelId: null });
});

describe('usePendingInviteChannel', () => {
    it('keeps a handed-over room in sessionStorage and removes it once consumed', () => {
        usePendingInviteChannel.getState().setPendingChannel('ch-invited');
        expect(stored()).toEqual({ channelId: 'ch-invited' });

        usePendingInviteChannel.getState().clearPendingChannel();
        expect(stored()).toEqual({ channelId: null });
    });

    it('brings the room back after the page is loaded again', async () => {
        // What a reload, or a rewind onto an entry from a document that is gone, leaves behind: an
        // empty in-memory store and the id still in the tab's sessionStorage.
        // (`beforeEach` has already emptied the in-memory store; setting it here would write over the
        // item, since every set is persisted.)
        sessionStorage.setItem(KEY, JSON.stringify({ state: { channelId: 'ch-invited' }, version: 0 }));

        await usePendingInviteChannel.persist.rehydrate();

        expect(usePendingInviteChannel.getState().channelId).toBe('ch-invited');
    });
});
