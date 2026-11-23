import { RELAY_SLOT } from '@chatic/transport';
import { renderHook } from '@testing-library/react';

import { useInvitedCloudNameSync } from './useInvitedCloudNameSync';

const syncInvitedCloudName = jest.fn(() => Promise.resolve());
let isVerified = true;
let isRelayVerified = true;
let selectedCloudId: string | null = 'cloud-b';
let mockBridge: string | null = 'react-native-webview';

jest.mock('@chatic/runtime-client/data/dataCommands', () => ({
    syncInvitedCloudName: (...args: unknown[]) => syncInvitedCloudName(...(args as [])),
}));
jest.mock('../../connection/hooks/useRuntimeSocketState', () => ({
    useRuntimeSocketState: () => ({ isVerified }),
}));
jest.mock('../../connection/hooks/useSlotVerified', () => ({
    useSlotVerified: (slot: string) => (slot === RELAY_SLOT ? isRelayVerified : false),
}));
jest.mock('../../session', () => ({ useSessionSelection: () => ({ selectedCloudId }) }));
jest.mock('@chatic/bridges', () => ({
    ...jest.requireActual('@chatic/bridges'),
    hostProfile: () => ({ bridge: mockBridge }),
}));

describe('useInvitedCloudNameSync', () => {
    beforeEach(() => {
        syncInvitedCloudName.mockClear();
        isVerified = true;
        isRelayVerified = true;
        selectedCloudId = 'cloud-b';
        mockBridge = 'react-native-webview';
    });

    it('syncs the active cloud name once both its socket and the relay are verified', () => {
        renderHook(() => useInvitedCloudNameSync());

        expect(syncInvitedCloudName).toHaveBeenCalledWith('cloud-b');
    });

    it('waits for the relay, then syncs once it verifies', () => {
        isRelayVerified = false;
        const { rerender } = renderHook(() => useInvitedCloudNameSync());
        expect(syncInvitedCloudName).not.toHaveBeenCalled();

        isRelayVerified = true;
        rerender();

        expect(syncInvitedCloudName).toHaveBeenCalledTimes(1);
        expect(syncInvitedCloudName).toHaveBeenCalledWith('cloud-b');
    });

    it('waits for the active socket as well', () => {
        isVerified = false;

        renderHook(() => useInvitedCloudNameSync());

        expect(syncInvitedCloudName).not.toHaveBeenCalled();
    });

    it.each([null, 'message-handler', 'webkit-message-handler'])('does nothing with bridge %p', bridge => {
        mockBridge = bridge;

        renderHook(() => useInvitedCloudNameSync());

        expect(syncInvitedCloudName).not.toHaveBeenCalled();
    });
});
