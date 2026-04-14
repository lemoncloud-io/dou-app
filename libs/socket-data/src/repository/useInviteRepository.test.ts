import { renderHook } from '@testing-library/react';
import { useInviteRepository } from './useInviteRepository';
import { createStorageAdapter } from '../storages';

jest.mock('../storages', () => ({
    createStorageAdapter: jest.fn(),
}));

describe('useInviteRepository', () => {
    const mockCloudId = 'test-cloud';
    const mockInviteDB = { loadAll: jest.fn(), load: jest.fn(), save: jest.fn(), delete: jest.fn() };

    beforeEach(() => {
        jest.clearAllMocks();
        (createStorageAdapter as jest.Mock).mockReturnValue(mockInviteDB);
    });

    it('getInvite: 특정 초대를 반환한다', async () => {
        mockInviteDB.load.mockResolvedValue({ id: 'inv1' });
        const { result } = renderHook(() => useInviteRepository(mockCloudId));
        const invite = await result.current.getInvite('inv1');
        expect(invite).toEqual({ id: 'inv1' });
        expect(mockInviteDB.load).toHaveBeenCalledWith('inv1');
    });

    it('saveInvite: 정상 저장된다', async () => {
        const { result } = renderHook(() => useInviteRepository(mockCloudId));
        const mockData = { id: 'inv1', title: 'Test Invite' } as any;
        await result.current.saveInvite('inv1', mockData);
        expect(mockInviteDB.save).toHaveBeenCalledWith('inv1', mockData);
    });
});
