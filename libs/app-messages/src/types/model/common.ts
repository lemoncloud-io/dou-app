/** 지원 플랫폼 타입 */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** 앱 로그 레벨 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 로그 발생 런타임 — 경계를 건널 때만 기록 (ADR-0047) */
export type AppLogOrigin = 'web' | 'native';

/** 앱 로그 정보 구조 */
export type AppLogInfo = {
    tag: string; // 로그 식별 태그
    message?: string; // 로그 메시지
    data?: unknown; // 첨부 데이터
    timestamp?: number; // 발생 시각 (ms)
    level?: AppLogLevel; // 로그 레벨
    error?: unknown; // 에러 객체
    source?: AppLogOrigin; // 발생 런타임 (경계 통과 시)
};

/** [요청] Web -> App 로그 전달 페이로드 */
export type SendLogPayload = {
    level?: AppLogLevel;
    tag?: string;
    message: string;
    data?: unknown;
    error?: unknown;
    /** 발생 시각 (ms) — 부재 시(구버전 웹) 수신 측이 수신 시각으로 폴백 (ADR-0047) */
    timestamp?: number;
    /** 발생 런타임 — 웹 포워더가 'web'으로 스탬프 */
    source?: AppLogOrigin;
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

/**
 * 네이티브가 감지했지만 직접 전송할 수 없는 리포트 항목 (ADR-0047).
 * `/hello/report` 서명 토큰은 웹 세션만 보유하므로, 네이티브는 감지 시점
 * 스냅샷을 큐(MMKV)에 쌓고 웹이 부팅 후 pull해 대리 전송한다.
 */
export type PendingReportInfo = {
    /** ack 기반 중복 전송 방지용 고유 id */
    id: string;
    /** 리포트 카테고리 (webview-crash | native-error | native-crash) */
    category: string;
    /** 요약 메시지 (예: 예외 message) */
    message?: string;
    /** JS 스택 (native-error에서 가용할 때) */
    stack?: string;
    /** 감지 시각 (ms) — 대리 전송 시각이 아닌 이 값을 payload timestamp로 쓴다 */
    detectedAt: number;
    /** 감지 시점의 통합 버퍼 스냅샷 (breadcrumb) */
    logs?: AppLogInfo[];
    /** 플랫폼 부가 정보 (isFatal, exit reason 등) */
    extra?: unknown;
};

/** [요청] 지연 리포트 큐 조회 페이로드 */
export type FetchPendingReportsPayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] 지연 리포트 큐 조회 페이로드 */
export type OnFetchPendingReportsPayload = {
    reports: PendingReportInfo[];
};

/** [요청] 전송 완료한 지연 리포트 정리 페이로드 */
export type AckPendingReportsPayload = {
    ids: string[];
};

/** [응답] 지연 리포트 정리 완료 페이로드 */
export type OnAckPendingReportsPayload = {
    /** 정리 후 남은 큐 크기 */
    size: number;
};
