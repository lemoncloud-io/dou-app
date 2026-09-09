import type { IRemoteConfigAdapter } from './lanes/RemoteCache';
import type { Platform, Stage } from './types';

/**
 * Everything this lib needs from the outside, in one place.
 *
 * The shape follows `HttpRuntimePorts` ([libs/http/src/ports.ts]): one interface per lib, and an
 * ABSENT member means "not wired" rather than "broken". A missing `shell` leaves the shell lane
 * empty; a missing `remote` leaves both server lanes empty. Nothing throws for want of an adapter.
 *
 * Only `env` is required, because a stage and a platform are what the registry's rules are judged
 * against — without them there is nothing to resolve.
 */
export interface ConfigRuntimePorts {
    env: IConfigEnvAdapter;
    storage?: ConfigStoragePorts;
    shell?: IShellKvAdapter;
    remote?: IRemoteConfigAdapter;
    /**
     * Called when two registry modules declare the same key. The first declaration is kept and the
     * later one dropped; this only reports it.
     *
     * A callback rather than a logger import: this lib depends on nothing (ADR-0079 결정 1), so the
     * app hands it `logger.error`.
     */
    onDuplicateKey?: (key: string) => void;
    /** Called when a confirmed shell write did not land, after the single retry. */
    onShellWriteFailed?: (key: string, error: unknown) => void;
}

/**
 * Build facts. `stage` and `buildStage` are deliberately separate.
 *
 * `stage` keeps today's behaviour — an injected value wins over the baked one, which is what
 * `WEB_ENV` does. `buildStage` reads only the value the bundler baked in, so it cannot be spoofed
 * by anything a page can set. Security-relevant `byStage` rules are judged against `buildStage`
 * (ADR-0080 결정 5).
 *
 * Each app implements this: the web reads `import.meta.env` plus `window.*`, React Native reads
 * `react-native-config`. That inversion is what keeps `import.meta` out of this lib and lets
 * mobile share the same code.
 */
export interface IConfigEnvAdapter {
    stage(): Stage;
    buildStage(): Stage;
    platform(): Platform;
    /** Raw build value by name, for keys whose default comes straight from the environment. */
    raw(name: string): string | undefined;
}

/**
 * The two stores an override can live in.
 *
 * Neither is a new type — this is the shape `@chatic/shared`'s `StorageAdapter` already has
 * (`getItem`/`setItem`/`removeItem`), taken structurally so this lib imports nothing.
 */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface ConfigStoragePorts {
    local?: StorageLike;
    session?: StorageLike;
}

/**
 * The shell as an opaque key-value store.
 *
 * The shell keeps `key -> string` and knows nothing about what any key means, which is why adding
 * a toggle costs no app release (ADR-0079 결정 9).
 *
 * `write` resolves only when the shell confirmed it. A dropped write would leave a panel claiming
 * it saved something it did not — the remote control has to know the button worked
 * (ADR-0080 결정 10). One retry happens above this port; a rejection after that reaches
 * `onShellWriteFailed`.
 */
export interface IShellKvAdapter {
    /** The boot envelope the shell injected. Read once, synchronously, during `init`. */
    readBag(): Readonly<Record<string, string>>;
    write(key: string, value: string): Promise<void>;
    clear(key: string): Promise<void>;
}
