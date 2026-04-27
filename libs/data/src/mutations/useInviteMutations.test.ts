// libs/data/src/hooks/useInviteMutations.test.ts
import { renderHook, act } from '@testing-library/react';
import { useWebSocketV2Store } from '@chatic/socket';
import { useInviteLocalDataSource } from '../local/data-sources';
import { useInviteMutations } from '../mutations';

jest.mock('@chatic/socket', () => ({ useWebSocketV2Store: jest.fn() }));
jest.mock('../local/data-sources', () => ({ useInviteRepository: jest.fn() }));
jest.mock('@chatic/web-core', () => ({
    useDynamicProfile: jest.fn(() => ({ uid: 'test-user' })),
    cloudCore: {
        getConfig: jest.fn(),
    },
}));

describe('useInviteMutations', () => {
    const mockSaveInvite = jest.fn();
    const mockCloudId = 'test-cloud';

    const mockRepoInstance = {
        saveInvite: mockSaveInvite,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (useWebSocketV2Store as unknown as jest.Mock).mockReturnValue({ cloudId: mockCloudId });
        (useInviteLocalDataSource as unknown as jest.Mock).mockReturnValue(mockRepoInstance);
    });

    it('saveInvite: DB에 저장 후 통합 이벤트를 방출한다', async () => {
        mockSaveInvite.mockResolvedValue(undefined);
        const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

        const { result } = renderHook(() => useInviteMutations());
        const mockInviteData = { id: 'inv1', title: 'Test Invite' };

        await act(async () => {
            await result.current.saveInvite(mockInviteData as any);
        });

        expect(mockSaveInvite).toHaveBeenCalledWith('inv1', mockInviteData);

        // 이벤트 방출 검증
        const expectedEventDetail = expect.objectContaining({
            detail: expect.objectContaining({
                domain: 'invitecloud',
                cid: mockCloudId,
                targetId: 'inv1',
            }),
        });
        expect(dispatchEventSpy).toHaveBeenCalledWith(expectedEventDetail);

        dispatchEventSpy.mockRestore();
    });
});
