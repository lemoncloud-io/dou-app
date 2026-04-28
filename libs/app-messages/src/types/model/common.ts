/** 지원 플랫폼 타입 */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** 앱 로그 레벨 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 앱 로그 정보 구조 */
export interface AppLogInfo {
    tag: string; // 로그 식별 태그
    message?: string; // 로그 메시지
    data?: any; // 첨부 데이터
    timestamp?: number; // 발생 시각 (ms)
    level?: AppLogLevel; // 로그 레벨
    error?: any; // 에러 객체
}

/** [응답] 앱 로그 수신 페이로드 */
export interface OnReceiveAppLogPayload {
    log: AppLogInfo;
}
