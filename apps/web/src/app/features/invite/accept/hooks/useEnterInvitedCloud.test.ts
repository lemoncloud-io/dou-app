import { act, renderHook } from '@testing-library/react';

const mockSwitchCloud = jest.fn();
const mockForgetInviteLogin = jest.fn();
let mockSelectedCloudId: string | null = null;

jest.mock('@chatic/app-runtime', () => ({
    runtime: {
        session: {
            useSwitchCloudSession: () => ({ switchCloud: mockSwitchCloud, isPending: false }),
            useSessionSelection: () => ({ selectedCloudId: mockSelectedCloudId }),
            forgetInviteLogin: (...args: unknown[]) => mockForgetInviteLogin(...args),
        },
    },
}));

const { useEnterInvitedCloud } = require('./useEnterInvitedCloud');

const info = { cloudId: 'cloud-1', $envs: { backend: 'https://cloud.example', wss: 'wss://cloud.example' } };
const inviteLogin = { handle: 'invite-login-1', cloudId: 'aws-1' };

const enter = async (...args: unknown[]) => {
    const { result } = renderHook(() => useEnterInvitedCloud());
    await act(async () => {
        await result.current.enterCloud(...args);
    });
};

describe('useEnterInvitedCloud', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockSelectedCloudId = null;
        mockSwitchCloud.mockResolvedValue({ cloudId: 'cloud-1' });
    });

    it("enters with the invite login's handle and the invite endpoints — never a token", async () => {
        await enter(info, inviteLogin);

        expect(mockSwitchCloud).toHaveBeenCalledWith('cloud-1', {
            inviteLogin: {
                handle: 'invite-login-1',
                cloudId: 'aws-1',
                backend: 'https://cloud.example',
                wss: 'wss://cloud.example',
            },
        });
    });

    it('still enters a cloud that is already selected when it has an invite answer', async () => {
        mockSelectedCloudId = 'cloud-1';

        await enter(info, inviteLogin);

        expect(mockSwitchCloud).toHaveBeenCalledTimes(1);
    });

    it('skips a cloud already selected when there is no invite answer to enter with', async () => {
        mockSelectedCloudId = 'cloud-1';

        await enter(info);

        expect(mockSwitchCloud).not.toHaveBeenCalled();
    });

    it('enters nothing for an invite without a cloud, and lets the runtime forget the answer', async () => {
        await enter({}, inviteLogin);

        expect(mockSwitchCloud).not.toHaveBeenCalled();
        expect(mockForgetInviteLogin).toHaveBeenCalledWith('invite-login-1');
    });

    it('retries a switch that got no HTTP answer', async () => {
        jest.useFakeTimers();
        try {
            mockSwitchCloud
                .mockRejectedValueOnce(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }))
                .mockResolvedValue({ cloudId: 'cloud-1' });
            const { result } = renderHook(() => useEnterInvitedCloud());

            await act(async () => {
                const entering = result.current.enterCloud(info);
                await jest.advanceTimersByTimeAsync(1000);
                await entering;
            });

            expect(mockSwitchCloud).toHaveBeenCalledTimes(2);
        } finally {
            jest.useRealTimers();
        }
    });
});
