import type { SyncPlan, SyncTask } from '../types';
import { SyncPriority } from '../types';
import type { ISyncManager } from '../managers';
import { logger } from '@chatic/bridges';

export interface ISyncScheduler {
    start(): void;
    stop(): void;

    /**
     * 사전 등록 없이 특정 매니저의 일회성 동기화 작업을 대기열에 추가하여 실행(Execute)합니다.
     * @param key 로깅 및 큐 관리를 위한 식별자
     * @param manager 동기화를 수행할 매니저 인스턴스
     * @param id 단일 항목 식별자 (옵션)
     * @param meta 동기화 실행 시 전달할 메타데이터 (옵션)
     * @param priority 큐 처리 우선순위 (기본값: HIGH)
     * @example
     * ```
     * scheduler.execute(
     *             'user_manual_trigger', // 큐 관리를 위한 일회성 키
     *             userManager,
     *             '10000012',         // 변경된 특정 항목의 ID
     *             { forceUpdate: true },     // 강제 업데이트 플래그 (메타 데이터 예시)
     *             SyncPriority.CRITICAL      // 사용자 요청이므로 최상위 우선순위 부여
     *         );
     * ```
     */
    execute(
        key: string,
        manager: ISyncManager,
        id?: string,
        meta?: Record<string, unknown>,
        priority?: SyncPriority
    ): void;

    /**
     * 주기적으로 실행될 정기 동기화 작업을 스케줄러에 등록합니다.
     * @param key 작업 식별자
     * @param manager 동기화 매니저 인스턴스
     * @param plan 실행 주기 및 정책
     * @example
     * ```
     * scheduler.registerPeriodic('users_periodic', userManager, {
     *         intervalMs: 10000,
     *         priority: SyncPriority.LOW, // 백그라운드 작업이므로 낮은 우선순위
     *         meta: { source: 'auto_sync' }, // 전체 동기화 시 전달할 기본 메타데이터
     *         maxRetries: 3,
     *         retryDelayMs: 2000,
     *         shouldSync: () => {
     *             // 예: 네트워크가 연결되어 있을 때만 true 반환
     *             return true;
     *         }
     *     });
     * ```
     */
    registerPeriodic(key: string, manager: ISyncManager, plan: SyncPlan): void;

    unregister(key: string): void;
}

export abstract class BaseSyncScheduler implements ISyncScheduler {
    // 관리 대상 매니저와 동기화 정책을 저장하는 맵
    protected readonly managers = new Map<string, ISyncManager>();
    protected readonly plans = new Map<string, SyncPlan>();

    // 실행 중인 주기적 타이머 ID를 저장하는 맵
    private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();

    // 우선순위 기반 작업 대기열 (Priority Queue)
    private taskQueue: SyncTask[] = [];

    // 현재 큐 처리 프로세스가 동작 중인지 여부 (중복 실행 방지)
    private isProcessing = false;

    // 스케줄러 자체의 동작 상태 플래그
    private isRunning = false;

    public registerPeriodic(key: string, manager: ISyncManager, plan: SyncPlan): void {
        this.managers.set(key, manager);
        this.plans.set(key, plan);

        // 스케줄러가 가동 중인 상태에서 새로운 정기 작업이 등록되면 즉시 타이머를 활성화합니다.
        if (this.isRunning && plan.intervalMs) {
            this.startInterval(key, manager, plan);
        }
    }

    public unregister(key: string): void {
        if (!this.managers.has(key)) return;

        // 1. 실행 중인 주기적 타이머(Interval) 해제
        const intervalId = this.intervals.get(key);
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(key);
        }

        // 2. 대기열(Queue)에서 해당 key와 관련된 모든 예정된 작업 소거
        this.taskQueue = this.taskQueue.filter(task => task.key !== key);

        // 3. 매니저 및 정책(Plan) 참조 해제 (메모리 반환)
        this.managers.delete(key);
        this.plans.delete(key);
    }

    public start(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        // 등록된 모든 매니저를 순회하며 주기가 설정된 작업의 타이머를 가동합니다.
        this.managers.forEach((manager, key) => {
            const plan = this.plans.get(key);
            if (plan?.intervalMs) {
                this.startInterval(key, manager, plan);
            }
        });
    }

    /**
     * 특정 카테고리의 주기적 동기화 타이머를 생성하고 관리합니다.
     */
    private startInterval(key: string, manager: ISyncManager, plan: SyncPlan): void {
        // 중복 타이머 생성을 방지합니다.
        if (this.intervals.has(key)) return;

        const intervalId = setInterval(() => {
            // 실행 조건(shouldSync)이 정의되어 있고, 조건을 만족하지 않으면 이번 주기는 건너뜁니다.
            if (plan.shouldSync && !plan.shouldSync()) return;

            // 주기적 작업을 대기열에 삽입합니다.
            this.enqueueTask({
                key,
                priority: plan.priority ?? SyncPriority.MEDIUM,
                syncFn: () => manager.sync(plan.id, plan.meta),
                plan,
                currentAttempt: 1,
            });
        }, plan.intervalMs);

        this.intervals.set(key, intervalId);
    }

    public execute(
        key: string,
        manager: ISyncManager,
        id?: string,
        meta?: Record<string, unknown>,
        priority: SyncPriority = SyncPriority.HIGH
    ): void {
        // 실행할 동기화 함수 클로저 생성
        const syncFn = () => manager.sync(id, meta);

        // 일회성 작업은 즉시 큐에 삽입되며, 재시도 로직을 적용하지 않습니다(maxRetries: 0).
        this.enqueueTask({
            key,
            priority,
            syncFn,
            plan: { maxRetries: 0, retryDelayMs: 0 },
            currentAttempt: 1,
        });
    }

    /**
     * 작업을 큐에 삽입하고, 우선순위가 높은 순으로 내림차순 정렬합니다.
     */
    private enqueueTask(task: SyncTask): void {
        this.taskQueue.push(task);
        this.taskQueue.sort((a, b) => b.priority - a.priority);

        // 작업 삽입 후 큐 프로세서를 호출하여 실행을 유도합니다.
        this.processQueue();
    }

    /**
     * 큐에 쌓인 작업을 순차적으로 꺼내서 실행합니다.
     * 한 번에 하나의 작업만 비동기로 실행하여 리소스 경합을 방지합니다.
     */
    private async processQueue(): Promise<void> {
        // 이미 다른 작업을 처리 중이거나 큐가 비어있으면 동작을 종료합니다.
        if (this.isProcessing || this.taskQueue.length === 0) return;

        this.isProcessing = true;

        while (this.taskQueue.length > 0) {
            // 우선순위가 가장 높은 작업(배열의 맨 앞)을 추출합니다.
            const task = this.taskQueue.shift()!;

            try {
                // 실제 동기화 로직을 대기(await)하며 실행합니다.
                await task.syncFn();
                logger.info(`SyncScheduler`, `동기화 성공 - key: ${task.key}, Priority: ${task.priority}`);
            } catch (error) {
                // 실패 시 재시도 핸들러로 예외를 전달합니다.
                await this.handleRetry(task, error);
            }
        }

        // 큐가 완전히 비워지면 처리 상태를 해제합니다.
        this.isProcessing = false;
    }

    /**
     * 실패한 동기화 작업에 대한 재시도를 처리합니다.
     * 지연 시간 대기 후 큐에 작업을 다시 삽입합니다.
     */
    private async handleRetry(task: SyncTask, error: unknown): Promise<void> {
        const maxRetries = task.plan?.maxRetries ?? 0;
        const retryDelayMs = task.plan?.retryDelayMs ?? 1000;

        if (task.currentAttempt <= maxRetries) {
            logger.warn(
                `SyncScheduler`,
                `동기화 재시도 대기 - key: ${task.key}, Attempt: ${task.currentAttempt}/${maxRetries}`
            );

            task.currentAttempt++;

            // 지정된 지연 시간 후 큐에 재삽입하여 우선순위에 맞게 재실행되도록 합니다.
            setTimeout(() => {
                this.enqueueTask(task);
            }, retryDelayMs);
        } else {
            logger.error('SyncScheduler', `동기화 영구 실패 - key: ${task.key}. 최대 재시도 횟수 초과.`, { error });
        }
    }

    public stop(): void {
        this.isRunning = false;

        // 실행 중인 모든 인터벌 타이머를 강제 해제합니다.
        this.intervals.forEach(id => clearInterval(id));
        this.intervals.clear();

        // 대기열을 완전히 비웁니다.
        this.taskQueue = [];
    }
}
