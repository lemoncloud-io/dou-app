import type { IRemoteConfigAdapter } from './lanes/RemoteCache';
import type { Platform, Stage } from './types';

export interface ConfigRuntimePorts {
    env: IConfigEnvAdapter;
    storage?: ConfigStoragePorts;
    shell?: IShellKvAdapter;
    remote?: IRemoteConfigAdapter;
    onDuplicateKey?: (key: string) => void;
    onShellWriteFailed?: (key: string, error: unknown) => void;
}

export interface IConfigEnvAdapter {
    stage(): Stage;
    buildStage(): Stage;
    platform(): Platform;
    raw(name: string): string | undefined;
}

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface ConfigStoragePorts {
    local?: StorageLike;
    session?: StorageLike;
}

export interface IShellKvAdapter {
    readBag(): Readonly<Record<string, string>>;
    write(key: string, value: string): Promise<void>;
    clear(key: string): Promise<void>;
}
