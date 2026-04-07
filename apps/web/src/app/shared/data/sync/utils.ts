/**
 * DB 갱신 시 현재 탭과 다른 탭 모두에 갱신 이벤트를 전파합니다.
 */
export const notifyDbUpdated = (detail: { domain: string; cid: string; channelId: string }) => {
    window.dispatchEvent(new CustomEvent('local-db-updated', { detail }));
    const bc = new BroadcastChannel('app-db-sync');
    bc.postMessage(detail);
    bc.close();
};
