import type { AppLogInfo } from '@chatic/app-messages';
import type { IKeyValueStorage } from '../../../database';

export interface ILogBufferService {
    persistQueue(): Promise<void>;
    loadQueue(): Promise<void>;
    append(log: AppLogInfo): Promise<void>;
    init(): Promise<() => void>;
    setStorage(nextStorage: IKeyValueStorage): Promise<void>;
    teardown(): void;
    getSize(): number;
    peek(count?: number): AppLogInfo[];
    poll(count?: number): Promise<AppLogInfo[]>;
    clear(): Promise<void>;
}
