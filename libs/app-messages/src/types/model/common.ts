/** 지원 플랫폼 타입 */
export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

/** 앱 로그 레벨 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 로그 발생 런타임 — 경계를 건널 때만 기록 (ADR-0047) */
export type AppLogOrigin = 'web' | 'native';

/** 앱 로그 정보 구조 */
export type AppLogInfo = {
    /**
     * 엔트리 고유 id — 서버 dedup 키. 하이브리드에서 웹 로그는 자기 큐와 네이티브 버퍼
     * 양쪽에 들어가고 업로더가 그 버퍼를 다시 끌어오므로, 이 값이 없으면 같은 로그가
     * 문서 두 건으로 저장된다. 있으면 문서 id 업서트라 한 건으로 합쳐진다.
     */
    id?: string;
    /** 발생 시점 컨텍스트 — 배치 업로드의 조회 축. 저장 시점 값과 다를 수 있어 발생 순간에 캡처한다 */
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
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
    /** 엔트리 고유 id — 서버 dedup 키 (부재 시 수신 측이 채운다) */
    id?: string;
    /** 발생 시점 컨텍스트 — 배치 업로드의 조회 축. 저장 시점 값과 다를 수 있어 발생 순간에 캡처한다 */
    runId?: string;
    sid?: string;
    uid?: string;
    cid?: string;
    appVersion?: string;
    webVersion?: string;
    route?: string;
    os?: string;
    osVersion?: string;
    model?: string;
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
 * [요청] 웹 큐 → 앱 전송 큐 배치 충전 페이로드 (ADR-0063).
 *
 * 건당 `SendLog`를 대체한다. 로그 1건마다 브리지를 왕복하면 그 횟수가 곧
 * UI 스레드 점유라, 요청마다 debug 1건을 찍는 `withNetworkLog` 같은 자리에서
 * 한 세션에 수백 번이 된다. 배치로 묶으면 주기당 1회다.
 *
 * 받는 쪽이 레벨로 갈라 넣는다 — 전 레벨은 통합 링버퍼(breadcrumb), 비-debug만
 * 전송 큐. 보내는 쪽이 두 번 나눠 보내면 왕복이 두 배가 되므로 분류는 앱의 몫이다.
 */
export type SendLogBatchPayload = {
    logs: AppLogInfo[];
};

/** [응답] 배치 충전 결과 페이로드 (ADR-0063) */
export type OnSendLogBatchPayload = {
    /** 전송 큐에 실제로 적재된 건수 (debug 제외분과 id 중복분이 빠진다) */
    accepted: number;
    /** 적재 후 앱 전송 큐 크기 — 웹이 업로드 리듬의 크기 트리거로 쓴다 */
    size: number;
};

/**
 * [요청] 앱 전송 큐에서 배치 조회 페이로드 (ADR-0063).
 *
 * **비파괴다.** 같은 엔트리를 다시 돌려주는 것이 정상이며, 놓아주는 것은
 * `AckLogUploadQueue`뿐이다. 조회가 곧 제거이면 전송 성공 전에 유일한 사본이
 * 사라져, 그 사이 프로세스가 죽으면 엔트리가 어디에도 남지 않는다 — 하필 앱이
 * 죽는 순간의 로그가 가장 필요한데 그것이 유실된다. 파괴적 소비는
 * `PollAppLogBuffer`(디버그 화면 전용)에만 남는다.
 */
export type FetchLogUploadQueuePayload = {
    limit?: number;
};

/** [응답] 앱 전송 큐 배치 조회 페이로드 (ADR-0063) */
export type OnFetchLogUploadQueuePayload = {
    logs: AppLogInfo[];
    /** 조회 시점의 전송 큐 전체 크기 (돌려준 배치 크기가 아니다) */
    size: number;
};

/** [요청] 전송 완료한 로그를 앱 전송 큐에서 정리 (ADR-0063) */
export type AckLogUploadQueuePayload = {
    ids: string[];
};

/** [응답] 앱 전송 큐 정리 완료 페이로드 (ADR-0063) */
export type OnAckLogUploadQueuePayload = {
    /** 정리 후 남은 큐 크기 */
    size: number;
};

/**
 * [요청] 앱 전송 큐 전량 폐기 페이로드 (ADR-0063).
 *
 * 기기 opt-out 전용이다. opt-out은 "이 기기에서 수집하지 마라"는 의사이므로
 * 이미 적재된 것이 남아 나가면 그 자체로 어긋난다 — 전송만 멈추는 빌드 플래그와
 * 성격이 다르다. 로그아웃에는 쓰지 않는다: 엔트리가 발생 시점 uid/cid를 들고
 * 있어 계정이 섞이지 않으므로 남겨도 되고, 지우면 세션 문제가 남긴 바로 그
 * 엔트리를 잃는다.
 */
export type ClearLogUploadQueuePayload = {
    // 추후 확장(옵셔널 필드 등)에 대비한 빈 객체 타입입니다.
};

/** [응답] 앱 전송 큐 폐기 완료 페이로드 (ADR-0063) */
export type OnClearLogUploadQueuePayload = {
    /** 폐기 후 크기 — 정상이면 0 */
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
