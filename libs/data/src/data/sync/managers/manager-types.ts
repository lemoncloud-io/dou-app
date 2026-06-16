import type { ISyncRepository } from '../../repositories';

/**
 * 도메인별 동기화 로직을 노출하는 매니저 인터페이스입니다.
 */
export interface ISyncManager {
    /**
     * 특정 항목을 동기화합니다.
     * @param id 동기화할 항목의 식별자
     * @param meta 동기화에 필요한 추가 정보 (옵션)
     */
    sync(id?: string, meta?: Record<string, unknown>): Promise<void>;
}

/**
 * SyncManager의 추상 기본 클래스입니다.
 * 특정 도메인의 동기화 로직을 캡슐화하며, Repository를 통해 실제 데이터 동기화를 수행합니다.
 * 이 클래스는 repository의 sync 및 syncAll 메서드를 직접 호출하는 기본 구현을 제공합니다.
 * 하위 클래스는 필요에 따라 이 동작을 오버라이드할 수 있습니다.
 */
export abstract class BaseDataSyncManager<TRepository extends ISyncRepository> implements ISyncManager {
    /**
     * SyncManager의 생성자입니다.
     * @param repository - 이 매니저가 데이터를 동기화할 Repository 인스턴스.
     *                     SyncManager는 이 Repository의 메서드를 호출하여 데이터를 읽거나 업데이트합니다.
     */
    protected constructor(public readonly repository: TRepository) {}

    public sync(id?: string, meta?: Record<string, unknown>): Promise<void> {
        return this.repository.sync(id, meta);
    }
}
