import { renderHook } from '@testing-library/react';

import { usePairedCloudNameSync } from './usePairedCloudNameSync';

const syncPairedCloudName = jest.fn(() => Promise.resolve());
const cloud = { id: 'cloud-repo' };
let isVerified = true;
let isRelayVerified = true;
let selectedCloudId: string | null = 'cloud-p';
let pairedCloudIds: string[] = ['cloud-p'];

jest.mock('@chatic/runtime-core/data/pairedCloudName', () => ({
    syncPairedCloudName: (...args: unknown[]) => syncPairedCloudName(...(args as [])),
}));
jest.mock('./useRuntimeRepositories', () => ({ useRuntimeRepositories: () => ({ cloud }) }));
jest.mock('../../connection/hooks/useRuntimeSocketState', () => ({
    useRuntimeSocketState: () => ({ isVerified }),
}));
jest.mock('../../connection/hooks/useSlotVerified', () => ({
    useSlotVerified: (slot: string) => (slot === 'relay-slot' ? isRelayVerified : false),
}));
jest.mock('@chatic/transport', () => ({ RELAY_SLOT: 'relay-slot' }));
jest.mock('../../session', () => ({ useSessionSelection: () => ({ selectedCloudId }) }));
jest.mock('../../session/hooks/pairing/usePairedSession', () => ({ usePairedCloudIds: () => pairedCloudIds }));

describe('usePairedCloudNameSync', () => {
    beforeEach(() => {
        syncPairedCloudName.mockClear();
        isVerified = true;
        isRelayVerified = true;
        selectedCloudId = 'cloud-p';
        pairedCloudIds = ['cloud-p'];
    });

    it('reads the paired cloud name once both its socket and the relay are verified', () => {
        const { rerender } = renderHook(() => usePairedCloudNameSync());
        rerender();

        expect(syncPairedCloudName).toHaveBeenCalledTimes(1);
        expect(syncPairedCloudName).toHaveBeenCalledWith(cloud, 'cloud-p');
    });

    it('waits for the relay and the active socket before reading', () => {
        isRelayVerified = false;
        isVerified = false;
        const { rerender } = renderHook(() => usePairedCloudNameSync());
        expect(syncPairedCloudName).not.toHaveBeenCalled();

        isVerified = true;
        rerender();
        expect(syncPairedCloudName).not.toHaveBeenCalled();

        isRelayVerified = true;
        rerender();
        expect(syncPairedCloudName).toHaveBeenCalledTimes(1);
    });

    it('leaves a cloud that is not paired alone, and reads it once it joins the list', () => {
        pairedCloudIds = [];
        const { rerender } = renderHook(() => usePairedCloudNameSync());
        expect(syncPairedCloudName).not.toHaveBeenCalled();

        pairedCloudIds = ['cloud-p'];
        rerender();
        expect(syncPairedCloudName).toHaveBeenCalledWith(cloud, 'cloud-p');
    });

    it('reads again for the next paired cloud entered, not in a loop for the same one', () => {
        pairedCloudIds = ['cloud-p', 'cloud-q'];
        const { rerender } = renderHook(() => usePairedCloudNameSync());

        selectedCloudId = 'cloud-q';
        rerender();
        rerender();

        expect(syncPairedCloudName.mock.calls).toEqual([
            [cloud, 'cloud-p'],
            [cloud, 'cloud-q'],
        ]);
    });

    it('reads again when the cloud is entered again after leaving it', () => {
        const { rerender } = renderHook(() => usePairedCloudNameSync());

        selectedCloudId = 'default';
        rerender();
        selectedCloudId = 'cloud-p';
        rerender();

        expect(syncPairedCloudName).toHaveBeenCalledTimes(2);
    });

    it('reads again when an ended pairing of the cloud is approved again', () => {
        const { rerender } = renderHook(() => usePairedCloudNameSync());

        pairedCloudIds = [];
        rerender();
        pairedCloudIds = ['cloud-p'];
        rerender();

        expect(syncPairedCloudName).toHaveBeenCalledTimes(2);
    });
});
