import { useCallback } from 'react';

import { config } from '@chatic/config';
import { runtime } from '@chatic/app-runtime';

/** 계정/클라우드 스코프 persist 키 — 각 스토어 persist `name`과 일치(단일 출처). */
const ACCOUNT_SCOPED_STORAGE_KEYS = [
    'chatic-joined-clouds',
    'chatic-my-cloud-uid',
    'chatic-cloud-push-badges',
    'chatic-notification-prefs',
    'chatic-saved-items',
    // 레거시 즐겨찾기 키 — migrateLegacyFavorites 가 장소를 열 때 옮긴다. 마이그레이션 전에 남은
    // id가 다음 계정으로 새는 걸 막으려면 로그아웃에도 지워야 한다(새 레코드는 아래 config.clear).
    'chatic-favorite-channels',
    'chatic-mentions',
    'chatic-site-profile-cursor',
    'chatic-selected-channel',
] as const;

/**
 * 로그아웃 시 이전 계정의 클라우드/데이터 잔존을 제거하는 reset 콜백을 돌려준다.
 *
 * 로그아웃은 풀 리로드(window.location.replace)라 인메모리 상태는 사라지지만,
 * persist된 localStorage 스토어는 생존한다 — 특히 `chatic-joined-clouds`가
 * CloudRail에 이전 계정 클라우드를 계속 노출시킨다(useClouds 병합).
 *
 * v2 엔진엔 전역 logout-callback 등록 지점이 없다(`registerLogoutCallback` 제거).
 * apps/web `useClearCache`와 동일하게, 로그아웃 플로우가 세션을 내리기 *前에*
 * 이 `resetAccount`를 직접 호출해야 한다(예: `resetAccount().finally(logout)`).
 * 그 시점엔 repository 스코프(cid/uid)가 아직 이전 유저를 가리켜 그 유저 캐시만
 * 정확히 비운다.
 *
 * 보존: isInvited / delegatorId(게스트 신원) / UI 설정(panel width, debug).
 * localStorage 통째 삭제는 위 보존 값을 깨므로 키를 명시적으로 제거한다.
 */
export const useAccountResetOnLogout = () => {
    const repos = runtime.data.useRuntimeRepositories();

    const resetAccount = useCallback(async (): Promise<void> => {
        ACCOUNT_SCOPED_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
        // 즐겨찾기/정렬은 이제 @chatic/config 레코드 — config.clear 가 lane 엔트리(인메모리)와
        // persist된 `@chatic/config.ui.*` 키를 함께 걷어낸다. removeItem 만으로는 인메모리 값이
        // 리로드 직전까지 살아 있다(ui.channelOrder 는 레지스트리 등록 전이면 unknownKey 무시).
        config.clear('ui.pinnedChannels', { lane: 'local' });
        config.clear('ui.channelOrder', { lane: 'local' });
        // IndexedDB는 uid 격리라 위생 목적 — best-effort. 실패해도 로그아웃을 막지
        // 않도록 reject를 삼킨다. (구 `clearAll()` → v2 `cacheClear()`; site→place,
        // inviteCloud→cloud 로 매핑된 7개 repo.)
        await Promise.all([
            repos.channel.cacheClear(),
            repos.chat.cacheClear(),
            repos.cloud.cacheClear(),
            repos.join.cacheClear(),
            repos.profile.cacheClear(),
            repos.place.cacheClear(),
            repos.user.cacheClear(),
        ]).catch(() => undefined);
    }, [repos]);

    return { resetAccount };
};
