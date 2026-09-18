import { describe, expect, it, vi } from 'vitest';

import { updateUserProfile } from './updateUserProfile';

describe('updateUserProfile', () => {
    it('페이로드를 그대로 넘겨 프로필을 수정한다', async () => {
        const updateProfile = vi.fn().mockResolvedValue(undefined);

        await updateUserProfile(updateProfile, { name: 'New Name' });

        expect(updateProfile).toHaveBeenCalledWith({ name: 'New Name' });
    });

    it('수정이 실패하면 그대로 던진다', async () => {
        const updateProfile = vi.fn().mockRejectedValue(new Error('boom'));

        await expect(updateUserProfile(updateProfile, { name: 'X' })).rejects.toThrow('boom');
    });

    // It used to re-issue the session after the update to refresh the "session-derived identity".
    // The repository already writes the user cache, and useRuntimeProfile subscribes to that same
    // cache, so nothing the UI reads ever changed — that one line was the only caller keeping the
    // whole cloud HTTP refresh chain alive.
    it('세션을 건드리지 않는다 — 인자가 프로필 수정 하나뿐이다', () => {
        expect(updateUserProfile.length).toBe(2);
    });
});
