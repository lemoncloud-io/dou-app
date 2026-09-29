import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';
import { useSendImages } from './useSendImages';

jest.mock('@chatic/app-runtime', () => ({ runtime: { data: { useSendImages: jest.fn(() => ({})) } } }));
const shellPut = jest.fn();
jest.mock('../../../bridge/shellUpload', () => ({
    getShellPut: jest.fn(() => shellPut),
    syncShellTransfers: jest.fn(async () => undefined),
}));
jest.mock('../../../bridge/useAppForeground', () => ({ useAppForeground: jest.fn() }));

describe('useSendImages (web shell)', () => {
    it("binds the runtime's send to this shell's PUT and catch-up", () => {
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

        expect(getShellPut).toHaveBeenCalled();
        expect(runtime.data.useSendImages).toHaveBeenCalledWith({
            cid: 'cloud-a',
            channelId: 'ch-1',
            parentId: 'root-1',
            put: shellPut,
            beforeSweep: syncShellTransfers,
        });
    });

    it('catches up with the shell whenever the app comes back to the front', () => {
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        const onForeground = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0] as () => void;
        onForeground();

        expect(syncShellTransfers).toHaveBeenCalledTimes(1);
    });
});
