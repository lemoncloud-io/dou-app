/**
 * 알림 정보
 * TODO: notification 스펙에 맞게 확장 필요
 * @author dev@example.com
 */
export interface NotificationInfo {
    title?: string;
    body?: string;
    data?: Record<string, any>;
}

export interface NotificationInfo {
    title?: string;
    body?: string;
    data?: Record<string, any>; // 커스텀 페이로드
}

/** [응답] FCM 토큰 결과 페이로드 */
export interface OnFetchFcmTokenPayload {
    token: string;
}

/** [응답] 알림 수신/오픈 이벤트 페이로드 */
export interface OnNotificationPayload {
    notification: NotificationInfo;
}

/** [요청] 뱃지 카운트 설정 페이로드 */
export interface SetBadgeCountPayload {
    count: number;
}

/** [응답] 뱃지 카운트 조회 결과 페이로드 */
export interface OnFetchBadgeCountPayload {
    count: number;
}

/** [응답] 뱃지 카운트 설정 결과 페이로드 */
export interface OnSetBadgeCountPayload {
    success: boolean;
}
