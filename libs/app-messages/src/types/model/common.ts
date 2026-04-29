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

/** [요청] Web -> App 로그 전달 페이로드 */
export interface SendLogPayload {
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: any;
    error?: any;
}

/** [요청] 로그 버퍼 조회 페이로드 */
export interface FetchAppLogBufferPayload {
    count?: number;
}

/** [요청] 로그 버퍼 poll(조회+제거) 페이로드 */
export interface PollAppLogBufferPayload {
    count?: number;
}

/** [응답] 로그 버퍼 조회 페이로드 */
export interface OnFetchAppLogBufferPayload {
    logs: AppLogInfo[];
    size: number;
}

/** [응답] 로그 버퍼 poll(조회+제거) 페이로드 */
export interface OnPollAppLogBufferPayload {
    logs: AppLogInfo[];
    size: number;
}

/** [응답] 로그 버퍼 전체 비우기 페이로드 */
export interface OnClearAppLogBufferPayload {
    success: boolean;
    size: number;
}

/** [응답] 로그 버퍼 크기 조회 페이로드 */
export interface OnFetchAppLogBufferSizePayload {
    size: number;
}
