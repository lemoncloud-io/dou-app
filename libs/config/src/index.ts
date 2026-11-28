import { RemoteCache } from './lanes/RemoteCache';
import type { IRemoteConfigAdapter, RemotePayload } from './lanes/RemoteCache';
import type { ConfigRuntimePorts, StorageLike } from './ports';
import { ConfigRegistry, findPolicyViolations } from './registry';
import { ALL_MODULES } from './registry/modules';
import { ConfigResolver, UNLOCK_KEY } from './resolve/ConfigResolver';
import { isValidValue } from './resolve/validate';
import { ConfigStore } from './store/ConfigStore';
import type { ConfigChangeListener, ConfigRegistryModule, ConfigSnapshot, Lane, SetResult, Writer } from './types';
import { decodeValue, encodeValue, storageKeyFor } from './utils/serialize';

export type {
    AppliesAt,
    ConfigChangeListener,
    ConfigEntry,
    ConfigRegistryModule,
    ConfigSnapshot,
    FormerKey,
    Lane,
    Persist,
    Platform,
    SetRejection,
    SetResult,
    Stage,
    Surface,
    ValueOrigin,
    ValueType,
    Writer,
} from './types';
export type { ConfigRuntimePorts, IConfigEnvAdapter, IShellKvAdapter, StorageLike } from './ports';
export type { IRemoteConfigAdapter, RemotePayload } from './lanes/RemoteCache';
export { createWebEnvAdapter } from './adapters/webEnvAdapter';
export { UNLOCK_KEY } from './resolve/ConfigResolver';
export { encodeValue, storageKeyFor } from './utils/serialize';

const LANE_OF: Readonly<Record<Writer, Lane>> = { shell: 'shell', local: 'local', server: 'serverDefault' };

export interface SetOptions {
    lane: Writer;
}

export class ConfigFacade {
    private ports: ConfigRuntimePorts | null = null;
    private registry: ConfigRegistry;
    private readonly store = new ConfigStore();
    private readonly remote = new RemoteCache();
    private resolver: ConfigResolver | null = null;

    constructor(private readonly modules: readonly ConfigRegistryModule[] = ALL_MODULES) {
        this.registry = ConfigRegistry.merge(this.modules);
    }

    init(ports: ConfigRuntimePorts): void {
        this.ports = ports;
        this.registry = ConfigRegistry.merge(this.modules, ports.onDuplicateKey);
        this.resolver = new ConfigResolver(this.registry, this.store, this.remote, {
            stage: () => ports.env.stage(),
            buildStage: () => ports.env.buildStage(),
            platform: () => ports.env.platform(),
            raw: name => ports.env.raw(name),
            wired: () => this.wired(),
        });
        this.hydrateShell();
        this.hydrateStorage();
    }

    isInitialized(): boolean {
        return this.resolver !== null;
    }

    policyViolations(): readonly string[] {
        return findPolicyViolations(this.registry);
    }

    get<T>(key: string): T | undefined {
        return this.snapshot<T>(key)?.value;
    }

    snapshot<T>(key: string): ConfigSnapshot<T> | undefined {
        return this.resolver?.snapshot<T>(key);
    }

    snapshotAll(): readonly ConfigSnapshot[] {
        const resolver = this.resolver;
        if (!resolver) return [];
        return this.registry
            .keys()
            .map(key => resolver.snapshot(key))
            .filter((snapshot): snapshot is ConfigSnapshot => !!snapshot);
    }

    overriddenSnapshots(): readonly ConfigSnapshot[] {
        return this.snapshotAll().filter(snapshot => snapshot.isOverridden);
    }

    set(key: string, value: unknown, options: SetOptions): SetResult {
        const resolver = this.resolver;
        const ports = this.ports;
        if (!resolver || !ports) return { ok: false, reason: 'notWired' };

        const entry = this.registry.get(key);
        if (!entry) return { ok: false, reason: 'unknownKey' };
        if (!entry.writableBy.includes(options.lane)) return { ok: false, reason: 'laneNotAllowed' };
        if (!isValidValue(entry, value)) return { ok: false, reason: 'invalidValue' };
        if (options.lane === 'local' && !entry.meta && entry.surface === 'dev' && !resolver.isUnlocked()) {
            return { ok: false, reason: 'locked' };
        }

        const before = resolver.snapshot(key)?.value;
        this.store.write(LANE_OF[options.lane], key, value);
        this.persist(key, value);
        const after = resolver.snapshot(key)?.value;
        if (before !== after) this.store.notify([key]);
        return { ok: true };
    }

    subscribe(keys: readonly string[] | undefined, listener: ConfigChangeListener): () => void {
        return this.store.subscribe(keys, listener);
    }

    clear(key: string, options: SetOptions): SetResult {
        const resolver = this.resolver;
        const ports = this.ports;
        if (!resolver || !ports) return { ok: false, reason: 'notWired' };

        const entry = this.registry.get(key);
        if (!entry) return { ok: false, reason: 'unknownKey' };
        if (!entry.writableBy.includes(options.lane)) return { ok: false, reason: 'laneNotAllowed' };
        if (options.lane === 'local' && !entry.meta && entry.surface === 'dev' && !resolver.isUnlocked()) {
            return { ok: false, reason: 'locked' };
        }

        const before = resolver.snapshot(key)?.value;
        for (const stored of entry.formerKey ? [key, entry.formerKey.key] : [key]) {
            this.store.clear(LANE_OF[options.lane], stored);
            if (entry.persist === 'shell') void this.ports?.shell?.clear(stored);
            this.storageFor(entry.persist)?.removeItem(storageKeyFor(stored));
        }
        const after = resolver.snapshot(key)?.value;
        if (before !== after) this.store.notify([key]);
        return { ok: true };
    }

    applyRemotePayload(payload: RemotePayload): boolean {
        const keys = Object.keys(payload.entries);
        const before = new Map(keys.map(key => [key, this.snapshot(key)?.value]));
        const accepted = this.remote.accept(payload);
        if (accepted) this.store.notify(keys.filter(key => before.get(key) !== this.snapshot(key)?.value));
        return accepted;
    }

    async refreshRemote(): Promise<boolean> {
        const adapter: IRemoteConfigAdapter | undefined = this.ports?.remote;
        if (!adapter) return false;
        if (this.get<boolean>('system.remote.enabled') !== true) return false;
        try {
            return this.applyRemotePayload(await adapter.fetch());
        } catch {
            return false;
        }
    }

    private wired(): Readonly<Record<Writer, boolean>> {
        return {
            shell: !!this.ports?.shell,
            local: !!this.ports?.storage,
            server: !!this.ports?.remote,
        };
    }

    private hydrateShell(): void {
        const shell = this.ports?.shell;
        if (!shell) return;
        const bag = shell.readBag();
        const decoded: Record<string, unknown> = {};
        for (const [key, raw] of Object.entries(bag)) {
            const value = decodeValue(raw);
            if (value.has) decoded[key] = value.value;
        }
        this.store.replaceLane('shell', decoded);
    }

    private hydrateStorage(): void {
        for (const key of this.registry.keys()) {
            const entry = this.registry.get(key);
            if (!entry) continue;
            const storage = this.storageFor(entry.persist);
            if (!storage) continue;
            for (const stored of entry.formerKey ? [key, entry.formerKey.key] : [key]) {
                const value = decodeValue(storage.getItem(storageKeyFor(stored)));
                if (value.has) this.store.write('local', stored, value.value);
            }
        }
    }

    private storageFor(persist: string): StorageLike | undefined {
        if (persist === 'local' || persist === 'shell') return this.ports?.storage?.local;
        if (persist === 'session') return this.ports?.storage?.session;
        return undefined;
    }

    private persist(key: string, value: unknown): void {
        const entry = this.registry.get(key);
        if (!entry) return;
        const raw = encodeValue(value);
        if (entry.persist === 'shell') void this.writeShellConfirmed(key, raw);
        try {
            this.storageFor(entry.persist)?.setItem(storageKeyFor(key), raw);
        } catch {
            // A blocked or full store must not break the toggle that reads it.
        }
    }

    private async writeShellConfirmed(key: string, raw: string): Promise<void> {
        const shell = this.ports?.shell;
        if (!shell) return;
        try {
            await shell.write(key, raw);
        } catch {
            try {
                await shell.write(key, raw);
            } catch (error) {
                this.ports?.onShellWriteFailed?.(key, error);
            }
        }
    }
}

export const createConfig = (modules?: readonly ConfigRegistryModule[]): ConfigFacade => new ConfigFacade(modules);

export const config = new ConfigFacade();

export { UNLOCK_KEY as CONFIG_UNLOCK_KEY };
