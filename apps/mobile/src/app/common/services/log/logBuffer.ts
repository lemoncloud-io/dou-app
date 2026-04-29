import { logger } from './log';
import type { ILogStorage } from './logStorage';
import { mmkvLogStorage } from './logStorage';
import { serializeError, serializeLogValue } from './utils';
import { createRingBuffer } from './utils/ringBuffer';
import type { AppLogInfo } from '@chatic/app-messages';

export const createLogBufferService = (storage: ILogStorage) => {
    const LOG_QUEUE_STORAGE_KEY = '@chatic/log.queue';
    const queue = createRingBuffer<AppLogInfo>(64);

    let initialized = false;
    let unsubscribeLogger: (() => void) | undefined;
    let currentStorage = storage;

    const logBufferService = {
        /**
         * 현재 큐 상태를 저장소에 영속화한다.
         */
        persistQueue: async (): Promise<void> => {
            try {
                await currentStorage.save(LOG_QUEUE_STORAGE_KEY, queue.toArray());
            } catch (e) {
                console.warn(`Failed append log.${e}`);
            }
        },

        /**
         * 저장소에서 큐를 불러와 메모리 상태를 복원한다.
         */
        loadQueue: async (): Promise<void> => {
            try {
                const persisted = await currentStorage.load<AppLogInfo[]>(LOG_QUEUE_STORAGE_KEY);
                queue.load(persisted ?? []);
            } catch {
                queue.clear();
            }
        },

        /**
         * 단일 로그를 큐에 적재하고 즉시 영속화한다.
         */
        append: async (log: AppLogInfo): Promise<void> => {
            queue.push(log);
            await logBufferService.persistQueue();
        },

        /**
         * logger 구독을 시작하고 큐 복원을 수행한다.
         * 이미 초기화되어 있으면 기존 teardown 함수를 반환한다.
         */
        init: async (): Promise<() => void> => {
            if (initialized) return logBufferService.teardown;

            await logBufferService.loadQueue();
            unsubscribeLogger = logger.subscribe((_level, tag, message, data, error) => {
                void logBufferService.append({
                    tag,
                    message,
                    data: serializeLogValue(data),
                    timestamp: Date.now(),
                    error: serializeError(error),
                });
            });
            initialized = true;

            return logBufferService.teardown;
        },

        /**
         * 런타임에 저장소 구현체를 교체한다.
         * 교체 직후 새 저장소 기준으로 큐를 다시 로드한다.
         */
        setStorage: async (nextStorage: ILogStorage): Promise<void> => {
            currentStorage = nextStorage;
            await logBufferService.loadQueue();
        },

        /**
         * logger 구독을 해제하고 초기화 상태를 되돌린다.
         */
        teardown: () => {
            unsubscribeLogger?.();
            unsubscribeLogger = undefined;
            initialized = false;
        },

        /**
         * 현재 큐의 길이를 반환한다.
         */
        getSize: () => queue.size(),

        /**
         * 큐 앞에서 count개를 조회만 한다. (큐 유지)
         */
        peek: (count = queue.size()): AppLogInfo[] => {
            return queue.peek(count);
        },

        /**
         * 큐 앞에서 count개를 꺼내고 제거한다.
         * 제거 후 즉시 영속화한다.
         */
        poll: async (count = queue.size()): Promise<AppLogInfo[]> => {
            const entries = queue.shift(count);
            await logBufferService.persistQueue();
            return entries;
        },

        /**
         * 큐 전체를 비우고 저장소에 반영한다.
         */
        clear: async (): Promise<void> => {
            queue.clear();
            await logBufferService.persistQueue();
        },
    };

    void logBufferService.init();
    return logBufferService;
};

export const logBufferService = createLogBufferService(mmkvLogStorage);
