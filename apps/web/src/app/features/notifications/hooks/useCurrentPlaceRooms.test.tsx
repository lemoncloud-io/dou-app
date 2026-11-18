import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/runtime';
import type { DomainChannel } from '@chatic/data';

import { ActiveCloudDataContext, type ActiveCloudData } from '../../../hooks/activeCloudDataContext';
import { useCurrentPlaceRooms } from './useCurrentPlaceRooms';

jest.mock('@chatic/runtime', () => ({
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

const channel = (overrides: Partial<DomainChannel> = {}): DomainChannel =>
    ({ id: 'ch1', cid: 'c1', sid: 'p1', stereo: 'public', chatNo: 0, ...overrides }) as unknown as DomainChannel;

const render = (channels: DomainChannel[]) => {
    data = { channels, isLoaded: true, myJoins: new Map(), unreads: {} as never };
    return renderHook(() => useCurrentPlaceRooms(), { wrapper: Wrapper });
};

const dispose = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({ selectedCloudId: 'c1', selectedSiteId: 'p1' });
    (runtime.session.useUidInCloud as jest.Mock).mockReturnValue('me');
    (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(true);
    (runtime.sync.registerSyncTarget as jest.Mock).mockReturnValue(dispose);
});

describe('useCurrentPlaceRooms', () => {
    it("lists the current place's rooms with the place each is filed under", () => {
        const { result } = render([channel(), channel({ id: 'ch2', sid: 'p2' })]);

        expect(result.current.cloudId).toBe('c1');
        expect(result.current.rooms.map(room => [room.channel.id, room.placeId])).toEqual([['ch1', 'p1']]);
    });

    it("leaves out the reader's notes room and other clouds' rooms", () => {
        const { result } = render([channel({ id: 'self', stereo: 'self' }), channel({ id: 'far', cid: 'c2' })]);

        expect(result.current.rooms).toEqual([]);
    });

    it('lists nothing while no place is selected', () => {
        (runtime.session.useSessionSelection as jest.Mock).mockReturnValue({
            selectedCloudId: 'c1',
            selectedSiteId: '',
        });

        expect(render([channel()]).result.current.rooms).toEqual([]);
    });

    it("keeps each room's channel sync registered while it is in scope", () => {
        const { unmount } = render([channel(), channel({ id: 'ch2' })]);

        expect(runtime.sync.registerSyncTarget).toHaveBeenCalledWith({ type: 'channel', id: 'ch1' }, { cid: 'c1' });
        expect(runtime.sync.registerSyncTarget).toHaveBeenCalledWith({ type: 'channel', id: 'ch2' }, { cid: 'c1' });
        unmount();
        expect(dispose).toHaveBeenCalledTimes(2);
    });

    it('registers nothing before the cloud is verified', () => {
        (runtime.connection.useCloudVerified as jest.Mock).mockReturnValue(false);

        render([channel()]);

        expect(runtime.sync.registerSyncTarget).not.toHaveBeenCalled();
    });
});
