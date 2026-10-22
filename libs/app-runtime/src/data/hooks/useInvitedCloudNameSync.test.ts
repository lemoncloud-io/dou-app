import { renderHook } from '@testing-library/react';

import { useInvitedCloudNameSync } from './useInvitedCloudNameSync';

const syncInvitedCloudName = jest.fn(() => Promise.resolve());
const cloud = { id: 'cloud-repo' };
let isVerified = true;
let isRelayVerified = true;
let selectedCloudId: string | null = 'cloud-b';

jest.mock('../invitedCloudDurability', () => ({
    syncInvitedCloudName: (...args: unknown[]) => syncInvitedCloudName(...(args as [])),
}));
jest.mock('./useRuntimeRepositories', () => ({ useRuntimeRepositories: () => ({ cloud }) }));
jest.mock('../../connection/hooks/useRuntimeSocketState', () => ({
    useRuntimeSocketState: () => ({ isVerified }),
}));
jest.mock('../../connection/hooks/useSlotVerified', () => ({
    useSlotVerified: (slot: string) => (slot === 'relay-slot' ? isRelayVerified : false),
}));
jest.mock('../../socket/utils/slotKey', () => ({ RELAY_SLOT: 'relay-slot' }));
jest.mock('../../session', () => ({ useSessionSelection: () => ({ selectedCloudId }) }));
jest.mock('../../utils/isNativeApp', () => ({ isNativeApp: () => true }));

describe('useInvitedCloudNameSync', () => {
    beforeEach(() => {
        syncInvitedCloudName.mockClear();
        isVerified = true;
        isRelayVerified = true;
        selectedCloudId = 'cloud-b';
    });

    it('syncs the active cloud name once both its socket and the relay are verified', () => {
        renderHook(() => useInvitedCloudNameSync());

        expect(syncInvitedCloudName).toHaveBeenCalledWith(cloud, 'cloud-b');
    });

    // The name is read from the relay, and the run is spent once it starts: starting it while only
    // the cloud's socket is up would leave the name unsynced for the whole visit.
    it('waits for the relay, then syncs once it verifies', () => {
        isRelayVerified = false;
        const { rerender } = renderHook(() => useInvitedCloudNameSync());
        expect(syncInvitedCloudName).not.toHaveBeenCalled();

        isRelayVerified = true;
        rerender();

        expect(syncInvitedCloudName).toHaveBeenCalledTimes(1);
        expect(syncInvitedCloudName).toHaveBeenCalledWith(cloud, 'cloud-b');
    });

    it('waits for the active socket as well', () => {
        isVerified = false;

        renderHook(() => useInvitedCloudNameSync());

        expect(syncInvitedCloudName).not.toHaveBeenCalled();
    });
});
