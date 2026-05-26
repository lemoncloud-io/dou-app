import type { TestRecord } from '@chatic/app-messages';
import type { TestRecordDataSource } from '../../data/cache/TestRecordDataSource';
import type { ILogService } from '../log';

class AsyncMutexQueue {
    private queue: Promise<any> = Promise.resolve();

    public run<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.queue = this.queue.then(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

export class TestRecordService {
    private readonly mutex = new AsyncMutexQueue();

    constructor(
        private readonly logService: ILogService,
        private readonly dataSource: TestRecordDataSource
    ) {}

    public fetch(key: string): Promise<TestRecord | null> {
        return this.mutex.run(async () => {
            try {
                return await this.dataSource.fetch(key);
            } catch (error) {
                this.logService.error('TEST', `Fetch error for key: ${key}`, error as Error);
                return null;
            }
        });
    }

    public fetchAll(keys?: string[]): Promise<TestRecord[]> {
        return this.mutex.run(async () => {
            try {
                return await this.dataSource.fetchAll(keys);
            } catch (error) {
                this.logService.error('TEST', `FetchAll error`, error as Error);
                return [];
            }
        });
    }

    public save(key: string, value: string): Promise<boolean> {
        return this.mutex.run(async () => {
            try {
                const updatedAt = Date.now();
                await this.dataSource.save(key, value, updatedAt);
                return true;
            } catch (error) {
                this.logService.error('TEST', `Save error for key: ${key}`, error as Error);
                return false;
            }
        });
    }

    public saveAll(items: Array<{ key: string; value: string }>): Promise<boolean> {
        return this.mutex.run(async () => {
            try {
                const updatedAt = Date.now();
                await this.dataSource.saveAll(items, updatedAt);
                return true;
            } catch (error) {
                this.logService.error('TEST', `SaveAll error`, error as Error);
                return false;
            }
        });
    }

    public clear(): Promise<boolean> {
        return this.mutex.run(async () => {
            try {
                await this.dataSource.clear();
                return true;
            } catch (error) {
                this.logService.error('TEST', `Clear error`, error as Error);
                return false;
            }
        });
    }
}
