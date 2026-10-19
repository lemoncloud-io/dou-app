import { act, render } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { useOnReceiveNotification } from '../bridge';
import { InvitedCloudDurabilityRunner } from './InvitedCloudDurabilityRunner';

const cloudRepository = { name: 'cloud-repository' };

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        boot: { isNativeApp: jest.fn() },
        data: {
            useRuntimeRepositories: jest.fn(),
            useInvitedCloudNameSync: jest.fn(),
            recoverInvitedCloudIfMissing: jest.fn(),
        },
    },
}));
jest.mock('../bridge', () => ({ useOnReceiveNotification: jest.fn() }));

type ReceiveMessage = { data?: { notification?: { data?: Record<string, unknown> } } };
let captured: ((message: ReceiveMessage) => void) | undefined;

const recoverMock = runtime.data.recoverInvitedCloudIfMissing as jest.Mock;
const isNativeAppMock = runtime.boot.isNativeApp as jest.Mock;

/** Hands the runner a foreground push, the way the bridge would. */
const deliver = (data: Record<string, unknown>) => {
    if (!captured) throw new Error('the runner did not subscribe to OnReceiveNotification');
    captured({ data: { notification: { data } } });
};

/** A foreground push whose cloud id rides in the `payload` JSON string, as chat pushes send it. */
const receive = (cid: string) => deliver({ payload: JSON.stringify({ cid, channelId: 'ch1' }) });

beforeEach(() => {
    jest.clearAllMocks();
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ cloud: cloudRepository });
    isNativeAppMock.mockReturnValue(true);
    recoverMock.mockResolvedValue(undefined);
    (useOnReceiveNotification as jest.Mock).mockImplementation((handler: typeof captured) => {
        captured = handler;
    });
    render(<InvitedCloudDurabilityRunner />);
});

describe('InvitedCloudDurabilityRunner', () => {
    it('recovers the cloud a foreground push names', () => {
        receive('cloud_1');
        expect(recoverMock).toHaveBeenCalledWith(cloudRepository, 'cloud_1');
    });

    it('reads a cid flattened onto the push data too', () => {
        deliver({ cid: 'cloud_1' });
        expect(recoverMock).toHaveBeenCalledWith(cloudRepository, 'cloud_1');
    });

    it("does not ask delegate-cloud for a relay-origin push's '#'", () => {
        receive('#');
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it("does not recover the relay under the app's own name for it either", () => {
        receive('default');
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('does nothing for a push with no cloud id', () => {
        deliver({ channelId: 'ch1' });
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('does nothing outside the native app', () => {
        isNativeAppMock.mockReturnValue(false);
        receive('cloud_1');
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('recovers a cloud once while a recovery for it is in flight', async () => {
        let settle!: () => void;
        recoverMock.mockReturnValueOnce(new Promise<void>(resolve => (settle = resolve)));

        receive('cloud_1');
        receive('cloud_1');
        receive('cloud_2');
        expect(recoverMock.mock.calls.map(([, cid]) => cid)).toEqual(['cloud_1', 'cloud_2']);

        // Once the first settles, a later push for the same cloud is checked again.
        await act(async () => settle());
        receive('cloud_1');
        expect(recoverMock.mock.calls.map(([, cid]) => cid)).toEqual(['cloud_1', 'cloud_2', 'cloud_1']);
    });

    it('lets a cloud be recovered again after a recovery that failed', async () => {
        recoverMock.mockRejectedValueOnce(new Error('cache read failed'));

        receive('cloud_1');
        await act(async () => undefined);
        receive('cloud_1');

        expect(recoverMock).toHaveBeenCalledTimes(2);
    });
});
