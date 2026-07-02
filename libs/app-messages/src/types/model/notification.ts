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
    /**
     * 선택. Windows 전용 — 태스크바 overlay 아이콘으로 쓸 PNG data URL.
     * Windows에는 dock 뱃지가 없어 overlay 아이콘이 필요하고, Electron nativeImage는
     * SVG를 못 그리므로 렌더러(canvas)에서 PNG로 그려 전달합니다. macOS/Linux는 무시.
     */
    overlayIconDataUrl?: string;
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
 * [요청] 알림 설정 스냅샷 동기화 페이로드 (web -> app, desktop 전용).
 * 크로스클라우드 FCM 배너는 main 프로세스가 직접 띄우므로, 렌더러의 DND/전역 스위치
 * 상태를 셸로 미러링해 main도 같은 기준으로 배너를 억제할 수 있게 합니다.
 */
export type SetNotificationPrefsPayload = {
    /** OS 알림 전역 스위치 (useNotificationPrefsStore.desktopEnabled). */
    enabled: boolean;
    /** 스누즈 종료 epoch ms; null = 스누즈 아님. */
    snoozeUntil: number | null;
    /** 반복 조용시간 "HH:MM" 24h (자정 통과 허용); null = 꺼짐. */
    quietHours: { start: string; end: string } | null;
};

/** [응답] 알림 설정 동기화 결과 페이로드 */
export type OnSetNotificationPrefsPayload = {
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
