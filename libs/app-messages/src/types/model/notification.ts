/**
 * 알림 정보
 * TODO: notification 스펙에 맞게 확장 필요
 * @author dev@example.com
 */
export type NotificationInfo = {
    title?: string;
    body?: string;
    data?: Record<string, any>; // 커스텀 페이로드
};

/** [요청] FCM 토큰 조회 페이로드 */
export type FetchFcmTokenPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 뱃지 카운트 조회 페이로드 */
export type FetchBadgeCountPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] FCM 토큰 결과 페이로드 */
export type OnFetchFcmTokenPayload = {
    token: string;
};

/** [응답] 알림 수신/오픈 이벤트 페이로드 */
export type OnNotificationPayload = {
    notification: NotificationInfo;
};

/** [요청] 뱃지 카운트 설정 페이로드 */
export type SetBadgeCountPayload = {
    count: number;
};

/** [응답] 뱃지 카운트 조회 결과 페이로드 */
export type OnFetchBadgeCountPayload = {
    count: number;
};

/** [응답] 뱃지 카운트 설정 결과 페이로드 */
export type OnSetBadgeCountPayload = {
    success: boolean;
};

/**
 * [요청] OS 알림 표시 페이로드 (web -> app).
 * 데스크탑은 FCM이 없어 살아있는 WS가 새 메시지를 감지하면 셸에 OS 알림을 요청합니다.
 */
export type ShowNotificationPayload = {
    title: string;
    body: string;
    channelId?: string;
    deeplink?: string;
};

/** [응답] OS 알림 표시 결과 페이로드 */
export type OnShowNotificationPayload = {
    success: boolean;
};
