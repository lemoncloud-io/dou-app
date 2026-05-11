import type { ISocketClient } from '../remote/clients';

/**
 * 동기화 대상의 기본 정보입니다.
 * 'type'과 'id'로 특정 리소스를 식별합니다.
 * TODO: 타입은 이후 구체적인 타입으로 변경될 예정
 */
export interface SyncTarget {
    /** 동기화할 리소스의 타입 (예: 'device', 'channel') */
    type: string;
    /** 리소스의 고유 식별자 */
    id: string;
}

/**
 * 각 도메인의 동기화 전략을 정의하는 인터페이스입니다.
 * SyncScheduler는 이 인터페이스의 구현체들을 사용하여 동기화를 수행합니다.
 * TODO: 타입은 이후 구체적인 타입으로 변경될 예정
 */
export interface DomainSyncPlan {
    /**
     * 이 전략이 담당하는 도메인 타입을 반환합니다. (예: 'device')
     */
    getType(): string;

    /**
     * 주어진 동기화 대상에 대해 동기화가 필요한지 확인하고,
     * 필요하다면 동기화 작업을 수행합니다.
     *
     * @param client 통신에 사용할 SocketClient 인스턴스
     * @param target 동기화 대상
     * @param lastKnownTick 클라이언트가 마지막으로 알고 있던 서버의 상태 값 (tick)
     * @returns 동기화 후 최신 tick 값을 포함하는 Promise
     */
    run(client: ISocketClient, target: SyncTarget, lastKnownTick?: number): Promise<number | undefined>;
}

/**
 * 주기적인 데이터 동기화를 관리하는 스케줄러 인터페이스입니다.
 * TODO: 타입은 이후 구체적인 타입으로 변경될 예정
 */
export interface ISyncScheduler {
    /**
     * 스케줄러에 동기화 전략(plan)을 등록합니다.
     * @param plan 등록할 DomainSyncPlan 인스턴스
     */
    register(plan: DomainSyncPlan): void;

    /**
     * 특정 대상을 동기화 목록에 추가합니다.
     * 스케줄러는 주기적으로 이 대상의 동기화를 시도합니다.
     * @param target 동기화할 대상
     */
    addTarget(target: SyncTarget): void;

    /**
     * 특정 대상을 동기화 목록에서 제거합니다.
     * @param target 제거할 대상
     */
    removeTarget(target: SyncTarget): void;

    /**
     * 동기화 루프를 시작합니다.
     */
    start(): void;

    /**
     * 동기화 루프를 중지합니다.
     */
    stop(): void;
}
