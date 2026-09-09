import type { RemoteCache } from '../lanes/RemoteCache';
import type { ConfigRegistry } from '../registry';
import type { ConfigStore } from '../store/ConfigStore';
import type { ConfigEntry, ConfigSnapshot, Lane, Platform, Stage, ValueOrigin, Writer } from '../types';
import { ConfigLanePolicy } from './ConfigLanePolicy';
import { isValidValue } from './validate';

/** The key that opens the local lane. Resolved before anything else, and exempt from its own gate. */
export const UNLOCK_KEY = 'system.overridesUnlocked';

export interface ResolverFacts {
    stage: () => Stage;
    buildStage: () => Stage;
    platform: () => Platform;
    wired: () => Readonly<Record<Writer, boolean>>;
}

/**
 * Folds the precedence table into one value.
 *
 * Every lane's value goes through `isValidValue` before it is used, so a corrupted store or a
 * stale payload is demoted to the next row instead of reaching a screen. `defaultValue` is the
 * floor, which is why `get` can be synchronous and never fail.
 */
export class ConfigResolver {
    private readonly policy = new ConfigLanePolicy();

    constructor(
        private readonly registry: ConfigRegistry,
        private readonly store: ConfigStore,
        private readonly remote: RemoteCache,
        private readonly facts: ResolverFacts
    ) {}

    /**
     * Whether the local lane is open.
     *
     * Resolving this does not need the answer it produces: the unlock key is `meta`, so the policy
     * skips the gate for it. That exemption is what keeps this from recursing.
     */
    isUnlocked(): boolean {
        const entry = this.registry.get(UNLOCK_KEY);
        if (!entry) return false;
        return this.fold(UNLOCK_KEY, entry, false).value === true;
    }

    snapshot<T>(key: string): ConfigSnapshot<T> | undefined {
        const entry = this.registry.get(key);
        if (!entry) return undefined;
        const isUnlocked = entry.meta ? false : this.isUnlocked();
        const { value, origin } = this.fold(key, entry, isUnlocked);
        return {
            key,
            entry: entry as ConfigEntry<T>,
            value: value as T,
            origin,
            isOverridden: origin !== 'stageRule' && origin !== 'default',
            canWrite: this.policy.writersFor(entry, isUnlocked, this.facts.wired()),
        };
    }

    private fold(key: string, entry: ConfigEntry, isUnlocked: boolean): { value: unknown; origin: ValueOrigin } {
        for (const lane of this.policy.order) {
            if (!this.policy.canSupply(entry, lane, isUnlocked)) continue;
            const read = this.readLane(lane, key);
            if (!read.has) continue;
            if (!isValidValue(entry, read.value)) continue;
            return { value: read.value, origin: lane };
        }

        // Row 5. A security-relevant rule is judged against the baked stage, which no page can set.
        const stage = entry.meta || key.startsWith('debug.') ? this.facts.buildStage() : this.facts.stage();
        const byStage = entry.byStage?.[stage];
        if (byStage !== undefined && isValidValue(entry, byStage)) {
            return { value: byStage, origin: 'stageRule' };
        }
        const byPlatform = entry.byPlatform?.[this.facts.platform()];
        if (byPlatform !== undefined && isValidValue(entry, byPlatform)) {
            return { value: byPlatform, origin: 'stageRule' };
        }

        return { value: entry.defaultValue, origin: 'default' };
    }

    /**
     * Row 1 is read first and on its own.
     *
     * A kill switch is used when everything else is broken, so it must not travel the same path as
     * the thing it turns off. It looks at three things only — the cached payload, the key's own
     * `writableBy`, and the TTL — and never at a stage rule, a store or the shell. Rows 2 to 6
     * cannot change its answer.
     *
     * The other direction is deliberate too: if row 1 itself throws, it falls through quietly.
     * Turning everything off because of an error would be the larger accident.
     */
    private readLane(lane: Lane, key: string): { has: boolean; value?: unknown } {
        try {
            switch (lane) {
                case 'serverEnforced':
                    return this.remote.enforced(key);
                case 'serverDefault':
                    return this.remote.remoteDefault(key);
                default:
                    return this.store.read(lane, key);
            }
        } catch {
            return { has: false };
        }
    }
}
