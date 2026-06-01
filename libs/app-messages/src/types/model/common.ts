/** 지원 플랫폼 타입 */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** 앱 로그 레벨 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 앱 로그 정보 구조 */
export type AppLogInfo = {
    tag: string; // 로그 식별 태그
    message?: string; // 로그 메시지
    data?: unknown; // 첨부 데이터
    timestamp?: number; // 발생 시각 (ms)
    level?: AppLogLevel; // 로그 레벨
    error?: unknown; // 에러 객체
};

/** [요청] Web -> App 로그 전달 페이로드 */
export type SendLogPayload = {
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: unknown;
    error?: unknown;
};

/** [응답] Web -> App 로그 전달 완료 페이로드 */
export type OnSendLogPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 로그 버퍼 조회 페이로드 */
export type FetchAppLogBufferPayload = {
    count?: number;
};

/** [요청] 로그 버퍼 poll(조회+제거) 페이로드 */
export type PollAppLogBufferPayload = {
    count?: number;
};

/** [요청] 로그 버퍼 비우기 페이로드 */
export type ClearAppLogBufferPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [요청] 로그 버퍼 크기 조회 페이로드 */
export type FetchAppLogBufferSizePayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] 로그 버퍼 조회 페이로드 */
export type OnFetchAppLogBufferPayload = {
    logs: AppLogInfo[];
    size: number;
};

/** [응답] 로그 버퍼 poll(조회+제거) 페이로드 */
export type OnPollAppLogBufferPayload = {
    logs: AppLogInfo[];
    size: number;
};

/** [응답] 로그 버퍼 전체 비우기 페이로드 */
export type OnClearAppLogBufferPayload = {
    success: boolean;
    size: number;
};

/** [응답] 로그 버퍼 크기 조회 페이로드 */
export type OnFetchAppLogBufferSizePayload = {
    size: number;
};
