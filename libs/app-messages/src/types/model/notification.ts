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

/**
 * [요청] FCM 토큰 삭제 페이로드
 *
 * 재등록 경로를 시험하려면 토큰을 지워야 한다 — `FetchFcmToken`은 읽기뿐이라 이 동작을 대신하지
 * 못한다 (ADR-0080 디버그 패널 이관 단계 1).
 */
export type DeleteFcmTokenPayload = {
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

/** [응답] FCM 토큰 삭제 결과 페이로드 */
export type OnDeleteFcmTokenPayload = {
    success: boolean;
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

/**
 * [요청] 뱃지 base(네이티브 공유 카운터) 조회 페이로드.
 *
 * `FetchBadgeCount`와 별개의 메시지입니다. 그쪽은 notifee가 답하는데 notifee의 badge API는
 * iOS 전용(그 외 플랫폼에서 항상 0)이라, 안드로이드에서 실제 카운트를 들고 있는 공유 저장소를
 * 읽으려면 다른 창구가 필요합니다. 새 타입으로 낸 이유는 웹이 앱보다 먼저 배포되기 때문입니다 —
 * 구버전 셸은 이 메시지를 모르므로 `NOT_FOUND`로 답하고, 웹은 그 답으로 "이 셸에서는 알 수 없음"을
 * 학습합니다. 기존 메시지의 의미를 바꾸면 그 구분이 불가능합니다. (ADR-0099)
 */
export type FetchBadgeBasePayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/**
 * [응답] 뱃지 base 조회 결과 페이로드.
 *
 * `base`가 `null`이면 "이 플랫폼에서는 알 수 없음"입니다 — 0으로 답하지 않는 것이 계약의 핵심입니다.
 * 0은 유효한 카운트라서, 모르는 것을 0으로 답하면 소비자가 그것을 진짜 값으로 비교합니다.
 */
export type OnFetchBadgeBasePayload = {
    base: number | null;
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

/**
 * 백그라운드/종료 중 도착한 크로스 클라우드 푸시 한 건의 원시 판별 힌트 (ADR-0056).
 * 네이티브는 이 필드들을 해석하지 않고 그대로 저장만 한다 — `cid`의 relay 센티널(`'#'`)과
 * 배포 백엔드의 빈 문자열도 원시 그대로 남는다. 판별(resolvePushCloudId)은 웹의 단일
 * 지점에서만 수행한다.
 */
export type PushCloudMarkRecord = {
    cid?: string;
    uid?: string;
    channelId?: string;
    sid?: string;
    channelName?: string;
};

/** [요청] 크로스 클라우드 푸시 마크 조회 페이로드 (ADR-0056). 응답과 동시에 네이티브 저장소를 비운다(drain). */
export type FetchPushMarksPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] 크로스 클라우드 푸시 마크 drain 결과 페이로드 */
export type OnFetchPushMarksPayload = {
    marks: PushCloudMarkRecord[];
};
