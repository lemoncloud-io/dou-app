/**
 * 동기화 작업의 처리 우선순위를 정의하는 열거형(Enum)입니다.
 * 숫자가 클수록 높은 우선순위를 가지며, 대기열(Queue)에서 먼저 추출되어 처리됩니다.
 */
export enum SyncPriority {
    /** 저우선순위. 백그라운드 작업, 대용량 파일 스캔 등 시스템 리소스가 여유로울 때 적합합니다. */
    LOW = 0,
    /** 기본 우선순위. 일반적인 주기적 데이터 동기화 작업에 사용됩니다. */
    MEDIUM = 1,
    /** 고우선순위. UI에 즉각적인 반영이 필요하거나 빠른 업데이트가 요구되는 작업에 사용됩니다. */
    HIGH = 2,
    /** 최상위 우선순위. 사용자 입력에 의한 즉시 동기화 등 대기열을 무시하고 가장 먼저 처리되어야 하는 작업입니다. */
    CRITICAL = 3,
}

/**
 * 특정 카테고리(도메인)의 동기화 실행 정책 및 전략을 정의하는 인터페이스입니다.
 * 스케줄러에 Manager를 등록할 때 부여되며, 시스템 상태에 따른 유연한 실행을 지원합니다.
 */
export interface SyncPlan {
    /**
     * 동기화할 항목의 식별자
     */
    readonly id?: string;
    /**
     * 해당 도메인의 기본 동기화 우선순위.
     * 미지정 시 스케줄러 내부에서 기본값(예: MEDIUM)으로 처리됩니다.
     */
    readonly priority?: SyncPriority;

    /**
     * 주기적 동기화를 실행할 간격 (밀리초 단위).
     * 값이 지정되지 않으면 스케줄러의 주기 작업에 포함되지 않으며, 일회성(schedule)으로만 동작합니다.
     */
    readonly intervalMs?: number;

    /**
     * 동기화 실행 직전에 호출되어 실제 실행 여부를 결정하는 함수.
     * (예: 네트워크 상태(Wi-Fi), 배터리 잔량, 앱 포그라운드 상태 등 검사)
     * @returns {boolean} true 반환 시 동기화 대기열에 삽입, false 반환 시 이번 주기는 건너뜀.
     */
    readonly shouldSync?: () => boolean;

    /**
     * 동기화 작업 실패(Exception 발생) 시 재시도할 최대 횟수.
     */
    readonly maxRetries?: number;

    /**
     *  실패 후 다음 재시도를 수행하기 전 대기할 지연 시간 (밀리초 단위).
     */
    readonly retryDelayMs?: number;

    /**
     * 주기적 동기화 실행 시 매니저에게 전달할 기본 메타데이터입니다.
     */
    readonly meta?: Record<string, unknown>;
}

/**
 * 스케줄러의 우선순위 큐(Queue)에 적재되어 실제 실행을 대기하는 개별 작업(Task) 인터페이스입니다.
 * 주기적 실행(register) 또는 일회성 실행(schedule) 시 스케줄러 내부에서 생성됩니다.
 */
export interface SyncTask {
    /** 동기화 작업을 수행하는 카테고리(도메인) 식별자 문자열 */
    readonly key: string;

    /** 작업의 처리 우선순위. 큐 내부의 정렬 기준이 됩니다. */
    readonly priority: SyncPriority;

    /** * 실제 동기화를 수행하는 비동기 실행 래퍼 함수.
     * SyncManager의 `sync(id)` 또는 `syncAll()` 메서드가 바인딩되어 할당됩니다.
     */
    readonly syncFn: () => Promise<void>;

    /**
     *  해당 작업에 적용된 동기화 정책.
     * 재시도(Retry) 로직 실행 시 `maxRetries`와 `retryDelayMs`를 참조하기 위해 사용됩니다.
     */
    readonly plan?: SyncPlan;

    /**
     * 현재 작업의 시도 횟수를 추적하는 상태 값.
     * 실패 시 1씩 증가하며, `plan.maxRetries`와 비교하여 재시도 여부를 결정합니다.
     */
    currentAttempt: number;
}
