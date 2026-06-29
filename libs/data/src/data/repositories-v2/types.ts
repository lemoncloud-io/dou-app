export const createSnapshotDataContextProvider = (context: DataContext): DataContextProvider => {
    const snapshot = { ...context };
    return {
        getContext(): DataContext {
            return snapshot;
        },
        setContext(): void {
            // Snapshot-bound providers ignore later mutations by design.
        },
    };
};

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

export interface DisposableRepositoryV2 {
    dispose(): void;
}

export abstract class BaseRepositoryV2 {
    private readonly serialTasks = new Map<string, Promise<void>>();

    protected constructor(private readonly context: DataContextProvider) {}

    protected getRepositoryContext(): DataContext {
        return this.context?.getContext() ?? {};
    }

    protected getRequestContext(): DataContext {
        return { ...this.getRepositoryContext() };
    }

    protected getNormalizedContext(context: DataContext = this.getRepositoryContext()): DataContext {
        // V2 repositories normalize identifiers to cid/sid/uid before delegating work.
        return {
            cid: context.cid || 'default',
            sid: typeof context.sid === 'string' ? context.sid : undefined,
            uid: typeof context.uid === 'string' ? context.uid : undefined,
        };
    }

    protected assertRequiredString(value: string | undefined, fieldName: string): string {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value;
        }
        throw new Error(`[RepositoryV2] ${fieldName} is required.`);
    }

    protected runInBackground(task: () => Promise<unknown>, label: string): void {
        void task().catch(error => {
            console.error(`[RepositoryV2:${label}] background task failed`, error);
        });
    }

    protected runInBackgroundSerial(key: string, task: () => Promise<unknown>, label: string): void {
        const previous = this.serialTasks.get(key) ?? Promise.resolve();
        const current = previous
            .catch(() => undefined)
            .then(async () => {
                await task();
            })
            .catch(error => {
                console.error(`[RepositoryV2:${label}] background task failed`, error);
            })
            .finally(() => {
                if (this.serialTasks.get(key) === current) {
                    this.serialTasks.delete(key);
                }
            });
        this.serialTasks.set(key, current);
    }

    public dispose(): void {
        this.serialTasks.clear();
    }
}
