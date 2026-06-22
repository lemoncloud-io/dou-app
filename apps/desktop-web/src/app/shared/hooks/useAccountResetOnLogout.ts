import { useEffect } from 'react';

import { useRepositories } from '@chatic/app-runtime';
import { useWebCoreStore } from '@chatic/web-core';

/** 계정/클라우드 스코프 persist 키 — 각 스토어 persist `name`과 일치(단일 출처). */
const ACCOUNT_SCOPED_STORAGE_KEYS = [
    'chatic-joined-clouds',
    'chatic-my-cloud-uid',
    'chatic-cloud-push-badges',
    'chatic-notification-prefs',
    'chatic-saved-items',
    'chatic-mentions',
    'chatic-site-profile-cursor',
    'chatic-selected-place',
    'chatic-selected-channel',
] as const;

/**
 * 로그아웃 시 이전 계정의 클라우드/데이터 잔존을 제거한다.
 *
 * 로그아웃은 풀 리로드(window.location.replace)라 인메모리 상태는 사라지지만,
 * persist된 localStorage 스토어는 생존한다 — 특히 `chatic-joined-clouds`가
 * CloudRail에 이전 계정 클라우드를 계속 노출시킨다(useClouds 병합).
 *
 * registerLogoutCallback은 cloudCore.clearSession() 前에 실행되므로
 * repository.clearAll()의 스코프(cid/uid)가 아직 이전 유저를 가리켜 그 유저
 * 캐시만 정확히 비운다.
 *
 * 보존: isInvited / delegatorId(게스트 신원) / UI 설정(panel width, debug).
 * localStorage 통째 삭제는 위 보존 값을 깨므로 키를 명시적으로 제거한다.
 */
export const useAccountResetOnLogout = (): void => {
    const repositories = useRepositories();

    useEffect(() => {
        const reset = () => {
            ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
            // IndexedDB는 uid 격리라 위생 목적 — best-effort(await 안 함, 리로드가 끊을 수 있음).
            // 실패해도 로그아웃을 막지 않도록 reject를 삼킨다.
            void Promise.all([
                repositories.channel.clearAll(),
                repositories.chat.clearAll(),
                repositories.user.clearAll(),
                repositories.site.clearAll(),
                repositories.profile.clearAll(),
                repositories.join.clearAll(),
                repositories.inviteCloud.clearAll(),
            ]).catch(() => undefined);
        };
        return useWebCoreStore.getState().registerLogoutCallback(reset);
    }, [repositories]);
};
