import { act, render } from '@testing-library/react';

import { runtime } from '@chatic/runtime';

import { InvitedCloudDurabilityRunner } from './InvitedCloudDurabilityRunner';

const cloudRepository = { name: 'cloud-repository' };

const mockIsNativeApp = jest.fn();
type ReceivePayload = { notification?: { data?: Record<string, unknown> } };
let captured: ((payload: ReceivePayload) => void) | undefined;
const mockNotifications = {
    onReceive: (listener: typeof captured) => {
        captured = listener;
        return () => {
            captured = undefined;
        };
    },
};
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: {
            useRuntimeRepositories: jest.fn(),
            useInvitedCloudNameSync: jest.fn(),
            recoverInvitedCloudIfMissing: jest.fn(),
        },
        push: {
            get notifications() {
                return mockIsNativeApp() ? mockNotifications : null;
            },
        },
    })
);

const recoverMock = runtime.data.recoverInvitedCloudIfMissing as jest.Mock;
const isNativeAppMock = mockIsNativeApp;

const deliver = (data: Record<string, unknown>) => {
    if (!captured) throw new Error('the runner did not subscribe to the notifications');
    captured({ notification: { data } });
};

const receive = (cid: string) => deliver({ payload: JSON.stringify({ cid, channelId: 'ch1' }) });

const mount = () => render(<InvitedCloudDurabilityRunner />);

beforeEach(() => {
    jest.clearAllMocks();
    captured = undefined;
    (runtime.data.useRuntimeRepositories as jest.Mock).mockReturnValue({ cloud: cloudRepository });
    isNativeAppMock.mockReturnValue(true);
    recoverMock.mockResolvedValue(undefined);
});

describe('InvitedCloudDurabilityRunner', () => {
    it('recovers the cloud a foreground push names', () => {
        mount();
        receive('cloud_1');
        expect(recoverMock).toHaveBeenCalledWith('cloud_1');
    });

    it('reads a cid flattened onto the push data too', () => {
        mount();
        deliver({ cid: 'cloud_1' });
        expect(recoverMock).toHaveBeenCalledWith('cloud_1');
    });

    it("does not ask delegate-cloud for a relay-origin push's '#'", () => {
        mount();
        receive('#');
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it("does not recover the relay under the app's own name for it either", () => {
        mount();
        receive('default');
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('does nothing for a push with no cloud id', () => {
        mount();
        deliver({ channelId: 'ch1' });
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('does not listen outside the native app, where nothing hands the page a notification', () => {
        isNativeAppMock.mockReturnValue(false);
        mount();
        expect(captured).toBeUndefined();
        expect(recoverMock).not.toHaveBeenCalled();
    });

    it('stops listening once unmounted', () => {
        mount().unmount();
        expect(captured).toBeUndefined();
    });

    it('recovers a cloud once while a recovery for it is in flight', async () => {
        mount();
        let settle!: () => void;
        recoverMock.mockReturnValueOnce(new Promise<void>(resolve => (settle = resolve)));

        receive('cloud_1');
        receive('cloud_1');
        receive('cloud_2');
        expect(recoverMock.mock.calls.map(([cid]) => cid)).toEqual(['cloud_1', 'cloud_2']);

        await act(async () => settle());
        receive('cloud_1');
        expect(recoverMock.mock.calls.map(([cid]) => cid)).toEqual(['cloud_1', 'cloud_2', 'cloud_1']);
    });

    it('lets a cloud be recovered again after a recovery that failed', async () => {
        mount();
        recoverMock.mockRejectedValueOnce(new Error('cache read failed'));

        receive('cloud_1');
        await act(async () => undefined);
        receive('cloud_1');

        expect(recoverMock).toHaveBeenCalledTimes(2);
    });
});
