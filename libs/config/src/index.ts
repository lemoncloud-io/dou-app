import { RemoteCache } from './lanes/RemoteCache';
import type { IRemoteConfigAdapter, RemotePayload } from './lanes/RemoteCache';
import type { ConfigRuntimePorts, StorageLike } from './ports';
import { ConfigRegistry, findPolicyViolations } from './registry';
import { ALL_MODULES } from './registry/modules';
import { ConfigResolver, UNLOCK_KEY } from './resolve/ConfigResolver';
import { isValidValue } from './resolve/validate';
import { ConfigStore } from './store/ConfigStore';
import type { ConfigRegistryModule, ConfigSnapshot, Lane, SetResult, Writer } from './types';
import { decodeValue, encodeValue, storageKeyFor } from './utils/serialize';

export type {
    AppliesAt,
    ConfigEntry,
    ConfigRegistryModule,
    ConfigSnapshot,
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

/** Which lane a writer fills. */
const LANE_OF: Readonly<Record<Writer, Lane>> = { shell: 'shell', local: 'local', server: 'serverDefault' };

export interface SetOptions {
    lane: Writer;
}

/**
 * The one public surface.
 *
 * Shaped like `runtime.<group>.*` in `@chatic/app-runtime`: a facade over classes, not a bag of
 * loose exported functions. The internals stay off the barrel on purpose — a consumer holding
 * `ConfigResolver` directly could sidestep the lane policy (ADR-0079 결정 12).
 */
export class ConfigFacade {
    private ports: ConfigRuntimePorts | null = null;
    private registry: ConfigRegistry;
    private readonly store = new ConfigStore();
    private readonly remote = new RemoteCache();
    private resolver: ConfigResolver | null = null;

    constructor(private readonly modules: readonly ConfigRegistryModule[] = ALL_MODULES) {
        this.registry = ConfigRegistry.merge(this.modules);
    }

    /**
     * Plugs in the adapters. Called once by the app's composition root.
     *
     * Everything the old `web-config` did as an import side effect happens here instead, by an
     * explicit call the app controls (ADR-0079 결정 11).
     */
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

    /** Combinations the registry cannot satisfy. A test asserts this is empty. */
    policyViolations(): readonly string[] {
        return findPolicyViolations(this.registry);
    }

    /** Synchronous, and always an answer — `defaultValue` is the floor. */
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

    /** Keys whose resolved value differs from what the registry alone would give. */
    overriddenSnapshots(): readonly ConfigSnapshot[] {
        return this.snapshotAll().filter(snapshot => snapshot.isOverridden);
    }

    /**
     * Writes one lane.
     *
     * Refusals come back as a reason instead of an exception: a debug panel should say why the
     * control did nothing, not crash. Observers hear about it only when the RESOLVED value moved —
     * a change under a row that is already losing tells a watcher nothing true.
     */
    set(key: string, value: unknown, options: SetOptions): SetResult {
        const resolver = this.resolver;
        const ports = this.ports;
        if (!resolver || !ports) return { ok: false, reason: 'notWired' };

        const entry = this.registry.get(key);
        if (!entry) return { ok: false, reason: 'unknownKey' };
        if (!entry.writableBy.includes(options.lane)) return { ok: false, reason: 'laneNotAllowed' };
        if (!isValidValue(entry, value)) return { ok: false, reason: 'invalidValue' };
        if (options.lane === 'local' && !entry.meta && !resolver.isUnlocked()) {
            return { ok: false, reason: 'locked' };
        }

        const before = resolver.snapshot(key)?.value;
        this.store.write(LANE_OF[options.lane], key, value);
        this.persist(key, value);
        const after = resolver.snapshot(key)?.value;
        if (before !== after) this.store.notify([key]);
        return { ok: true };
    }

    /** Pass no keys to hear about every change. */
    subscribe(keys: readonly string[] | undefined, listener: () => void): () => void {
        return this.store.subscribe(keys, listener);
    }

    /**
     * Removes an override so resolution falls through to whatever is below it.
     *
     * Not the same as `set(key, defaultValue, ...)` — writing the default is itself a value that
     * would win the lane, while clearing removes the lane's entry so a lower row (a server default,
     * a stage rule) can show through again. This is what replaces `clearRelayTransportOverrides` —
     * logout clearing the deeplinked `?_backend`/`?_wss` override is exactly "stop shadowing
     * whatever the build would otherwise resolve to".
     */
    clear(key: string, options: SetOptions): SetResult {
        const resolver = this.resolver;
        const ports = this.ports;
        if (!resolver || !ports) return { ok: false, reason: 'notWired' };

        const entry = this.registry.get(key);
        if (!entry) return { ok: false, reason: 'unknownKey' };
        if (!entry.writableBy.includes(options.lane)) return { ok: false, reason: 'laneNotAllowed' };
        if (options.lane === 'local' && !entry.meta && !resolver.isUnlocked()) {
            return { ok: false, reason: 'locked' };
        }

        const before = resolver.snapshot(key)?.value;
        this.store.clear(LANE_OF[options.lane], key);
        if (entry.persist === 'shell') {
            void this.ports?.shell?.clear(key);
        } else {
            this.storageFor(entry.persist)?.removeItem(storageKeyFor(key));
        }
        const after = resolver.snapshot(key)?.value;
        if (before !== after) this.store.notify([key]);
        return { ok: true };
    }

    /**
     * Hands the cache a remote payload.
     *
     * No fetcher lives here — this lib knows nothing about the network (ADR-0079 결정 1). The app
     * builds one from `@chatic/http` and calls this. Until then a fake adapter in the tests is the
     * only caller, which is exactly what keeps the two server rows from rotting.
     */
    applyRemotePayload(payload: RemotePayload): boolean {
        const accepted = this.remote.accept(payload);
        if (accepted) this.store.notify(Object.keys(payload.entries));
        return accepted;
    }

    async refreshRemote(): Promise<boolean> {
        const adapter: IRemoteConfigAdapter | undefined = this.ports?.remote;
        if (!adapter) return false;
        if (this.get<boolean>('system.remote.enabled') !== true) return false;
        try {
            return this.applyRemotePayload(await adapter.fetch());
        } catch {
            // Keep the last known good payload, tell nobody, let the caller back off.
            return false;
        }
    }

    private wired(): Readonly<Record<Writer, boolean>> {
        return {
            shell: !!this.ports?.shell,
            local: !!this.ports?.storage,
            // Both server rows stay unwired until an adapter arrives AND the switch is on. Two
            // switches on purpose: merging the adapter and turning it on are separate decisions.
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
            const value = decodeValue(storage.getItem(storageKeyFor(key)));
            if (value.has) this.store.write('local', key, value.value);
        }
    }

    private storageFor(persist: string): StorageLike | undefined {
        if (persist === 'local') return this.ports?.storage?.local;
        if (persist === 'session') return this.ports?.storage?.session;
        return undefined;
    }

    private persist(key: string, value: unknown): void {
        const entry = this.registry.get(key);
        if (!entry) return;
        const raw = encodeValue(value);
        if (entry.persist === 'shell') {
            void this.writeShellConfirmed(key, raw);
            return;
        }
        try {
            this.storageFor(entry.persist)?.setItem(storageKeyFor(key), raw);
        } catch {
            // A blocked or full store must not break the toggle that reads it.
        }
    }

    /**
     * A confirmed write with one retry.
     *
     * Fire-and-forget would let a panel claim it saved something that never landed. The realistic
     * failure is a transient drop or a shell router that was not listening yet, not a rejected
     * value — hence exactly one retry, then an honest report (ADR-0080 결정 10).
     */
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

/** Factory, for tests that need their own registry. */
export const createConfig = (modules?: readonly ConfigRegistryModule[]): ConfigFacade => new ConfigFacade(modules);

/** The instance apps use. */
export const config = new ConfigFacade();

export { UNLOCK_KEY as CONFIG_UNLOCK_KEY };
