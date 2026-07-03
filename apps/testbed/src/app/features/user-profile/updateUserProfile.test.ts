import { describe, expect, it, vi } from 'vitest';

import { updateUserProfile } from './updateUserProfile';

describe('updateUserProfile', () => {
    it('프로필을 먼저 수정한 뒤 세션을 갱신한다', async () => {
        const calls: string[] = [];
        const updateProfile = vi.fn().mockImplementation(async () => void calls.push('update'));
        const refreshSession = vi.fn().mockImplementation(async () => void calls.push('refresh'));

        await updateUserProfile(updateProfile, refreshSession, { name: 'New Name' });

        expect(updateProfile).toHaveBeenCalledWith({ name: 'New Name' });
        expect(calls).toEqual(['update', 'refresh']);
    });

    it('프로필 수정이 실패하면 세션 갱신은 호출하지 않는다', async () => {
        const updateProfile = vi.fn().mockRejectedValue(new Error('boom'));
        const refreshSession = vi.fn();

        await expect(updateUserProfile(updateProfile, refreshSession, { name: 'X' })).rejects.toThrow('boom');
        expect(refreshSession).not.toHaveBeenCalled();
    });
});
