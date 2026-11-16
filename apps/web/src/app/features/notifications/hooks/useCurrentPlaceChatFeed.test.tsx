import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChannel, DomainChat } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCurrentPlaceChatFeed, type PlaceChatFeed } from './useCurrentPlaceChatFeed';

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: { useSessionSelection: jest.fn(), useUidInCloud: jest.fn() },
        connection: { useCloudVerified: jest.fn() },
        sync: { registerSyncTarget: jest.fn() },
    },
}));

let data: ActiveCloudData;
const Wrapper = ({ children }: { children: ReactNode }) => (
    <ActiveCloudDataContext.Provider value={data}>{children}</ActiveCloudDataContext.Provider>
);

const chat = (chatNo: number): DomainChat => ({ id: `ch1:${chatNo}`, chatNo, content: 'hi' }) as unknown as DomainChat;

const channel = (overrides: Partial<DomainChannel> = {}): DomainChannel =>
    ({ id: 'ch1', cid: 'c1', sid: 'p1', stereo: 'public', chatNo: 0, ...overrides }) as unknown as DomainChannel;

const at = (base: DomainChannel, chatNo: number): DomainChannel =>
    ({ ...base, chatNo, lastChat$: chat(chatNo) }) as unknown as DomainChannel;

const render = (channels: DomainChannel[]) => {
    data = { channels, isLoaded: true, myJoins: new Map(), unreads: {} as never };
    const onChat = jest.fn<void, [PlaceChatFeed]>();
    const hook = renderHook(() => useCurrentPlaceChatFeed(onChat), { wrapper: Wrapper });
    const update = (next: DomainChannel[]) => {
        data = { ...data, channels: next };
        hook.rerender();
    };
    return { onChat, update, hook };
};

const dispose = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'c1', selectedSiteId: 'p1' });
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.sync.registerSyncTarget as jest.Mock).mockReturnValue(dispose);
});

describe('useCurrentPlaceChatFeed', () => {
    it('takes the first record seen as a baseline, not as news', () => {
        const { onChat } = render([at(channel(), 5)]);
        expect(onChat).not.toHaveBeenCalled();
    });

    it('hands over the newest message when the record moves ahead', () => {
        const base = channel();
        const { onChat, update } = render([at(base, 5)]);
        update([at(base, 6)]);
        expect(onChat).toHaveBeenCalledTimes(1);
        expect(onChat.mock.calls[0][0]).toMatchObject({ cloudId: 'c1', placeId: 'p1', chat: { chatNo: 6 } });
    });

    it('hands over nothing for a record that stands still or steps back', () => {
        const base = channel();
        const { onChat, update } = render([at(base, 5)]);
        update([at(base, 5)]);
        update([at(base, 4)]);
        expect(onChat).not.toHaveBeenCalled();
    });

    it('starts the baseline at the first message of a room that was empty', () => {
        const base = channel();
        const { onChat, update } = render([base]);
        update([at(base, 1)]);
        expect(onChat).not.toHaveBeenCalled();
        update([at(base, 2)]);
        expect(onChat).toHaveBeenCalledTimes(1);
    });

    it('keeps to the current place and cloud, and leaves the notes room out', () => {
        const here = channel();
        const otherPlace = channel({ id: 'ch2', sid: 'p2' });
        const otherCloud = channel({ id: 'ch3', cid: 'c2' });
        const self = channel({ id: 'ch4', stereo: 'self' });
        const { onChat, update } = render([at(here, 1), at(otherPlace, 1), at(otherCloud, 1), at(self, 1)]);
        update([at(here, 2), at(otherPlace, 2), at(otherCloud, 2), at(self, 2)]);
        expect(onChat.mock.calls.map(([feed]) => feed.channel.id)).toEqual(['ch1']);
    });

    it('files a relay 1:1 under no place', () => {
        const dm = channel({ cid: 'default', sid: 'p9', stereo: 'dm' });
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({
            selectedCloudId: 'default',
            selectedSiteId: 'p1',
        });
        const { onChat, update } = render([at(dm, 1)]);
        update([at(dm, 2)]);
        expect(onChat.mock.calls[0][0].placeId).toBeUndefined();
    });

    it('keeps each room’s channel sync registered while in scope', () => {
        const { hook } = render([channel(), channel({ id: 'ch2' }), channel({ id: 'ch3', sid: 'p2' })]);
        expect(runtime.sync.registerSyncTarget).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' }, { cid: 'c1' });
        expect(runtime.sync.registerSyncTarget).toHaveBeenCalledWith({ type: 'channel', id: 'ch2' }, { cid: 'c1' });
        expect(runtime.sync.registerSyncTarget).toHaveBeenCalledTimes(2);
        hook.unmount();
        expect(dispose).toHaveBeenCalledTimes(2);
    });

    it('registers nothing until the cloud is verified', () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);
        render([channel()]);
        expect(runtime.sync.registerSyncTarget).not.toHaveBeenCalled();
    });
});
