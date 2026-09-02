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

    // 예전에는 수정 뒤 세션을 재발급해 "session-derived identity"를 갱신했다. 레포지토리가 이미
    // 사용자 캐시를 쓰고 useRuntimeProfile이 그 캐시를 구독하므로 UI가 읽는 것은 아무것도 바뀌지
    // 않았고, 그 한 줄이 클라우드 HTTP refresh 체인 전체의 유일한 호출부였다.
    it('세션을 건드리지 않는다 — 인자가 프로필 수정 하나뿐이다', () => {
        expect(updateUserProfile.length).toBe(2);
    });
});
