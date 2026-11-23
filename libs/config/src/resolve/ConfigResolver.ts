import type { RemoteCache } from '../lanes/RemoteCache';
import type { ConfigRegistry } from '../registry';
import type { ConfigStore } from '../store/ConfigStore';
import type { ConfigEntry, ConfigSnapshot, Lane, Platform, Stage, ValueOrigin, Writer } from '../types';
import { ConfigLanePolicy } from './ConfigLanePolicy';
import { isValidValue } from './validate';

export const UNLOCK_KEY = 'system.overridesUnlocked';

export interface ResolverFacts {
    stage: () => Stage;
    buildStage: () => Stage;
    platform: () => Platform;
    raw: (name: string) => string | undefined;
    wired: () => Readonly<Record<Writer, boolean>>;
}

export class ConfigResolver {
    private readonly policy = new ConfigLanePolicy();

    constructor(
        private readonly registry: ConfigRegistry,
        private readonly store: ConfigStore,
        private readonly remote: RemoteCache,
        private readonly facts: ResolverFacts
    ) {}

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
        if (key === 'env.stage') return { value: this.facts.stage(), origin: 'default' };
        if (key === 'env.buildStage') return { value: this.facts.buildStage(), origin: 'default' };
        if (key === 'env.platform') return { value: this.facts.platform(), origin: 'default' };

        for (const lane of this.policy.order) {
            if (!this.policy.canSupply(entry, lane, isUnlocked)) continue;
            const read = this.readLane(lane, key);
            if (!read.has) continue;
            if (!isValidValue(entry, read.value)) continue;
            return { value: read.value, origin: lane };
        }

        const stage = entry.meta || key.startsWith('debug.') ? this.facts.buildStage() : this.facts.stage();
        const byStage = entry.byStage?.[stage];
        if (byStage !== undefined && isValidValue(entry, byStage)) {
            return { value: byStage, origin: 'stageRule' };
        }
        const byPlatform = entry.byPlatform?.[this.facts.platform()];
        if (byPlatform !== undefined && isValidValue(entry, byPlatform)) {
            return { value: byPlatform, origin: 'stageRule' };
        }

        if (entry.envDefaultKey) {
            const raw = this.facts.raw(entry.envDefaultKey);
            if (raw !== undefined && isValidValue(entry, raw)) {
                return { value: raw, origin: 'default' };
            }
        }

        return { value: entry.defaultValue, origin: 'default' };
    }

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
