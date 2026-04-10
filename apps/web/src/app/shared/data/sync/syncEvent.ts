import type { CacheType } from '@chatic/app-messages';
import type { WSSActionType } from '@lemoncloud/chatic-sockets-api';

/**
 * 앱 전역 상태 도메인 (DB 테이블에 없는 상태들)
 */
export type AppStateDomain = 'auth' | 'presence' | 'system' | 'error';

/**
 * 통합 동기화 도메인
 */
export type AppSyncDomain = CacheType | AppStateDomain;

/**
 * 이벤트 상세 규격 (Generics 지원으로 payload 타입 보장)
 */
export interface AppSyncDetail<T = any> {
    /**
     * 도메인에 대한 알림
     */
    domain: AppSyncDomain;
    /**
     * 행위에 대한 알림
     */
    action?: WSSActionType;
    /**
     * 클라우드 id
     */
    cid: string;
    /**
     * 타겟 아이디
     * (channelId, userId,...)
     */
    targetId?: string;
    /**
     * 하위 대상 Id
     * (chatId, ...)
     */
    targetSubId?: string;
    /**
     * 응답으로 전달받은 데이터
     */
    payload?: T;
}

/**
 * 통합 앱 동기화 알림 함수
 */
export const notifyAppUpdated = <T>(detail: AppSyncDetail<T>) => {
    window.dispatchEvent(new CustomEvent('app-sync-updated', { detail }));
    const bc = new BroadcastChannel('app-sync-channel');
    bc.postMessage(detail);
    bc.close();
};
