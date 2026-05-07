import type { DataContext, DataContextProvider } from '../../repositories';

export type LocalDataSourceContextOverride = Partial<DataContext>;

/**
 * 모든 LocalDataSource가 공유하는 context 접근 기반 클래스입니다.
 * ContextHolder(Provider)를 주입받아 항상 최신 cid/uid/sid를 참조합니다.
 */
export abstract class BaseLocalDataSource {
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
}
