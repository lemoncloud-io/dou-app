import type { IEventBus } from '../events/eventBus';
import type { DomainEventMap } from '../events/types';
import type { DomainScope } from '../domain';

/**
 * Repository 요청 단위에서만 덮어쓸 수 있는 옵션입니다.
 * ref는 서버 응답과 Promise를 매칭하기 위한 식별자이고,
 * timeoutMs는 SocketRequestManager가 응답 대기를 중단할 제한 시간입니다.
 */
export interface RepositoryRequestOptions {
    ref?: string;
    timeoutMs?: number;

    /**
     * 읽기 시 cache/network 병행 정책을 제어합니다.
     * - cache-first: cache hit면 즉시 반환하고 background refresh 수행
     * - network-only: cache를 무시하고 network만 사용
     * - cache-only: network를 사용하지 않고 cache만 사용
     */
    cachePolicy?: RepositoryCachePolicy;
}

export type RepositoryCachePolicy = 'cache-first' | 'network-only' | 'cache-only' | 'cache-and-network';

/** 로컬 캐시 전용 bulk update 입력 타입입니다. */
export interface LocalCacheBulkPatch<TModel> {
    id: string;
    patch: Partial<TModel>;
}

/**
 * Repository 공통 로컬 캐시 조작 계약입니다.
 * 이 인터페이스의 메서드는 원격 요청 없이 LocalDataSource를 통해 캐시만 갱신합니다.
 */
export interface ILocalCacheMutationRepository<TModel> {
    cacheCreate(item: Partial<TModel>): Promise<void>;
    cacheUpdate(id: string, patch: Partial<TModel>): Promise<void>;
    cacheDelete(id: string): Promise<void>;
    cacheBulkCreate(items: Array<Partial<TModel>>): Promise<void>;
    cacheBulkUpdate(items: Array<LocalCacheBulkPatch<TModel>>): Promise<void>;
}

/**
 * Repository 계층 전체가 공유하는 실행 문맥입니다.
 * cid는 현재 연결된 cloud, sid는 선택된 place, uid는 현재 사용자를 의미합니다.
 * 서버 요청 및 향후 local cache 파티셔닝 정책에서 공통으로 참조할 수 있도록 Repository에 주입됩니다.
 */
export interface DataContext {
    /** 현재 연결된 cloud id */
    cid?: string;
    /** 현재 선택된 place id */
    sid?: string;
    /** 현재 사용자 id */
    uid?: string;

    /** 도메인별 추가 context를 수용하기 위한 확장 필드 */
    [key: string]: unknown;
}

/**
 * Repository가 최신 context를 직접 보관하지 않고 provider를 통해 읽도록 하는 계약입니다.
 * context 객체 자체가 교체되어도 Repository는 getContext() 호출 시점의 최신 값을 읽습니다.
 */
export interface DataContextProvider {
    getContext(): DataContext;

    setContext(context: DataContext): void;
}

/**
 * 외부 환경(web provider 등)에서 갱신하는 mutable context holder입니다.
 * Repository 인스턴스는 이 holder를 참조하므로 cid/sid/uid 변경이 있어도 Repository를 재생성할 필요가 없습니다.
 */
export class DataContextHolder implements DataContextProvider {
    constructor(private context: DataContext) {}

    public getContext(): DataContext {
        return this.context;
    }

    public setContext(context: DataContext): void {
        this.context = context;
    }
}

/**
 * Repository 공통 기반 클래스입니다.
 *
 * 모든 원격 Repository 메서드는 requestRemote를 통해 동일한 요청 파이프라인을 사용합니다.
 *
 * 주의:
 * - context와 domain event listener는 Repository 내부 정책을 위한 기능입니다.
 * - UI/Hook 계층에 노출되는 Repository 인터페이스에는 포함하지 않습니다.
 * - 도메인별 Repository가 로컬 캐시 갱신 등을 구현할 때 protected 메서드로만 사용합니다.
 */
export abstract class BaseRepository {
    protected constructor(
        private readonly context: DataContextProvider,
        protected readonly domainEventBus: IEventBus<DomainEventMap>
    ) {}

    /**
     * 현재 Repository 실행 문맥을 읽습니다.
     * 외부 context holder를 매번 조회하므로 cid/sid/uid 변경이 즉시 반영됩니다.
     */
    protected getRepositoryContext(): DataContext {
        return this.context?.getContext() ?? {};
    }

    protected getDomainScope(): DomainScope {
        const context = this.getRepositoryContext();
        return {
            cid: context.cid || 'default',
            sid: context.sid,
            uid: context.uid,
        };
    }

    protected runInBackground(task: () => Promise<unknown>, label: string): void {
        void task().catch(error => {
            console.error(`[Repository:${label}] background task failed`, error);
        });
    }

    protected resolveCachePolicy(options?: RepositoryRequestOptions): RepositoryCachePolicy {
        const policy = options?.cachePolicy;
        if (!policy || policy === 'cache-first' || policy === 'cache-and-network') {
            return 'cache-first';
        }
        return policy;
    }

    protected async fetchWithCachePolicy<T>({
        options,
        fetchLocal,
        fetchRemote,
        fallback,
        isLocalValid,
        backgroundLabel,
    }: {
        options?: RepositoryRequestOptions;
        fetchLocal: () => Promise<T | null>;
        fetchRemote: (options?: RepositoryRequestOptions) => Promise<T>;
        fallback: () => T;
        isLocalValid?: (local: T) => boolean;
        backgroundLabel: string;
    }): Promise<T> {
        const policy = this.resolveCachePolicy(options);
        if (policy === 'network-only') {
            return fetchRemote(options);
        }

        const local = await fetchLocal();
        if (policy === 'cache-only') {
            return local ?? fallback();
        }

        if (local && (isLocalValid ? isLocalValid(local) : true)) {
            this.runInBackground(
                () => fetchRemote({ ...options, cachePolicy: 'network-only' }),
                `${backgroundLabel}:cache-first-refresh`
            );
            return local;
        }

        return fetchRemote(options);
    }

    /**
     * RemoteDataSource가 domainEventBus로 발행한 이벤트를 Repository 내부에서 구독합니다.
     * 반환 함수는 Repository가 자체적으로 listener를 정리할 때 사용합니다.
     */
    protected onDomainEvent<K extends keyof DomainEventMap>(
        event: K,
        callback: (data: DomainEventMap[K]) => void
    ): () => void {
        return this.domainEventBus.on(event, callback);
    }
}
