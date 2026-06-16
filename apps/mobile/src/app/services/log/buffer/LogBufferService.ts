import type { ILogService } from '../types';
import { serializeError, serializeLogValue } from '../utils';
import type { ILogBufferService } from './types';
import type { AppLogInfo } from '@chatic/app-messages';
import type { IKeyValueStorage } from '../../../database';
import type { RingBuffer } from '../utils/ringBuffer';

export class LogBufferService implements ILogBufferService {
    private readonly LOG_QUEUE_STORAGE_KEY = '@chatic/log.queue';
    private readonly queue: RingBuffer<AppLogInfo>;

    private readonly logService: ILogService;
    private currentStorage: IKeyValueStorage;

    private initialized = false;
    private unsubscribeLogger?: () => void;

    constructor(logService: ILogService, storage: IKeyValueStorage, queue: RingBuffer<AppLogInfo>) {
        this.logService = logService;
        this.currentStorage = storage;
        this.queue = queue;
    }

    /**
     * 현재 큐 상태를 저장소에 영속화한다.
     */
    public async persistQueue(): Promise<void> {
        try {
            await this.currentStorage.set(this.LOG_QUEUE_STORAGE_KEY, this.queue.toArray());
        } catch (e) {
            console.warn(`Failed append log.${e}`);
        }
    }

    /**
     * 저장소에서 큐를 불러와 메모리 상태를 복원한다.
     */
    public async loadQueue(): Promise<void> {
        try {
            const persisted = await this.currentStorage.get<AppLogInfo[]>(this.LOG_QUEUE_STORAGE_KEY);
            this.queue.load(persisted ?? []);
        } catch {
            this.queue.clear();
        }
    }

    /**
     * 단일 로그를 큐에 적재하고 즉시 영속화한다.
     */
    public async append(log: AppLogInfo): Promise<void> {
        this.queue.push(log);
        await this.persistQueue();
    }

    /**
     * logger 구독을 시작하고 큐 복원을 수행한다.
     * 이미 초기화되어 있으면 기존 teardown 함수를 반환한다.
     */
    public async init(): Promise<() => void> {
        if (this.initialized) return this.teardown.bind(this);

        await this.loadQueue();
        this.unsubscribeLogger = this.logService.subscribe((level, tag, message, data, error) => {
            const entry: AppLogInfo = {
                level,
                tag,
                message,
                data: serializeLogValue(data),
                timestamp: Date.now(),
            };

            if (error != null) {
                entry.error = serializeError(error);
            }

            void this.append(entry);
        });
        this.initialized = true;

        return this.teardown.bind(this);
    }

    /**
     * 런타임에 저장소 구현체를 교체한다.
     * 교체 직후 새 저장소 기준으로 큐를 다시 로드한다.
     */
    public async setStorage(nextStorage: IKeyValueStorage): Promise<void> {
        this.currentStorage = nextStorage;
        await this.loadQueue();
    }

    /**
     * logger 구독을 해제하고 초기화 상태를 되돌린다.
     */
    public teardown(): void {
        this.unsubscribeLogger?.();
        this.unsubscribeLogger = undefined;
        this.initialized = false;
    }

    /**
     * 현재 큐의 길이를 반환한다.
     */
    public getSize(): number {
        return this.queue.size();
    }

    /**
     * 큐 앞에서 count개를 조회만 한다. (큐 유지)
     */
    public peek(count = this.queue.size()): AppLogInfo[] {
        return this.queue.peek(count);
    }

    /**
     * 큐 앞에서 count개를 꺼내고 제거한다.
     * 제거 후 즉시 영속화한다.
     */
    public async poll(count = this.queue.size()): Promise<AppLogInfo[]> {
        const entries = this.queue.shift(count);
        await this.persistQueue();
        return entries;
    }

    /**
     * 큐 전체를 비우고 저장소에 반영한다.
     */
    public async clear(): Promise<void> {
        this.queue.clear();
        await this.persistQueue();
    }
}
