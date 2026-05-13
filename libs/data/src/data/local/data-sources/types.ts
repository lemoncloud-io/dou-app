import type { DataContext, DataContextProvider } from '../../repositories';
import type { DomainListResult } from '../../domain';

export type LocalDataSourceContextOverride = Partial<DataContext>;
export type LocalStreamUnsubscribe = () => void;
export type LocalStreamCallback<T> = (value: T) => void;

/** LocalDataSource 공통 CRUD 계약입니다. */
export interface ICrudLocalDataSource<TModel> {
    getById(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<TModel | null>;
    upsert(item: Partial<TModel>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    upsertMany(items: Array<Partial<TModel>>, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    remove(id: string, contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    removeMany(ids: string[], contextOverride?: LocalDataSourceContextOverride): Promise<void>;
    clearAll(contextOverride?: LocalDataSourceContextOverride): Promise<void>;
}

/** LocalDataSource 공통 리스트 조회 계약입니다. */
export interface IListLocalDataSource<TModel, TQuery = void, TResult = DomainListResult<TModel>> {
    fetchList(query: TQuery, contextOverride?: LocalDataSourceContextOverride): Promise<TResult | null>;
}

/** LocalDataSource 공통 스트림 구독 계약입니다. */
export interface IStreamLocalDataSource<TModel, TListQuery = void, TListResult = DomainListResult<TModel>> {
    subscribeItem(
        id: string,
        callback: LocalStreamCallback<TModel | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
    subscribeList(
        query: TListQuery,
        callback: LocalStreamCallback<TListResult | null>,
        contextOverride?: LocalDataSourceContextOverride
    ): LocalStreamUnsubscribe;
}

/**
 * 모든 LocalDataSource가 공유하는 context 접근 기반 클래스입니다.
 * ContextHolder(Provider)를 주입받아 항상 최신 cid/uid/sid를 참조합니다.
 */
export abstract class BaseLocalDataSource {
    private nextSubscriberId = 0;
    private streamSubscribers = new Map<number, () => Promise<void>>();

    protected constructor(protected readonly contextProvider: DataContextProvider) {}

    protected getContext(contextOverride?: LocalDataSourceContextOverride): DataContext {
        return {
            ...this.contextProvider.getContext(),
            ...contextOverride,
        };
    }

    protected getUid(contextOverride?: LocalDataSourceContextOverride): string {
        return this.getContext(contextOverride).uid || 'default';
    }

    protected getCid(contextOverride?: LocalDataSourceContextOverride): string {
        return this.getContext(contextOverride).cid || 'default';
    }

    protected getSid(contextOverride?: LocalDataSourceContextOverride): string | undefined {
        return this.getContext(contextOverride).sid;
    }

    /**
     * LocalDataSource 내부 전용 query stream 구독기입니다.
     * subscribe 시점과 emit 시점마다 query를 다시 실행하여 최신 값을 전달합니다.
     */
    protected subscribeQueryStream<T>(
        query: () => Promise<T>,
        callback: LocalStreamCallback<T>
    ): LocalStreamUnsubscribe {
        const id = this.nextSubscriberId + 1;
        this.nextSubscriberId = id;

        const notify = async (): Promise<void> => {
            const next = await query();
            callback(next);
        };

        this.streamSubscribers.set(id, notify);
        void this.safeNotify(notify);

        return () => {
            this.streamSubscribers.delete(id);
        };
    }

    /**
     * 로컬 캐시 상태 변경 직후, 현재 DataSource의 모든 구독자에게 최신 스냅샷을 재방출합니다.
     */
    protected async emitAllStreams(): Promise<void> {
        const subscribers = Array.from(this.streamSubscribers.values());
        await Promise.all(subscribers.map(subscriber => this.safeNotify(subscriber)));
    }

    private async safeNotify(notify: () => Promise<void>): Promise<void> {
        try {
            await notify();
        } catch (error) {
            console.error('[LocalDataSource] stream notify failed', error);
        }
    }
}
