import type { ConfigEntry, ConfigRegistryModule } from '../types';

/**
 * What every key MEANS, merged from one module per domain.
 *
 * **A duplicate key does not stop the boot.** The reason to reject one is real — silently
 * overwriting lets two domains read the same key differently — but the price was wrong. Roughly
 * four in five keys are developer-only, and one mistake among those must not keep every user's app
 * from starting. So the check moved: a test walks the merged modules and fails, and at runtime the
 * FIRST declaration wins, the later one is dropped, and `onDuplicateKey` reports it. The order is
 * fixed, so two devices never disagree about which one survived (ADR-0079 결정 2).
 */
export class ConfigRegistry {
    private readonly entries: Map<string, ConfigEntry>;

    private constructor(entries: Map<string, ConfigEntry>) {
        this.entries = entries;
    }

    static merge(modules: readonly ConfigRegistryModule[], onDuplicateKey?: (key: string) => void): ConfigRegistry {
        const merged = new Map<string, ConfigEntry>();
        for (const module of modules) {
            for (const [key, entry] of Object.entries(module)) {
                if (merged.has(key)) {
                    onDuplicateKey?.(key);
                    continue;
                }
                merged.set(key, entry);
            }
        }
        return new ConfigRegistry(merged);
    }

    get(key: string): ConfigEntry | undefined {
        return this.entries.get(key);
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    keys(): readonly string[] {
        return [...this.entries.keys()];
    }
}

/**
 * Combinations that cannot be satisfied.
 *
 * Handled the same way as a duplicate key — a test fails on these, and at runtime the offending
 * key is dropped rather than taking the app down with it.
 */
export const findPolicyViolations = (registry: ConfigRegistry): readonly string[] => {
    const problems: string[] = [];
    for (const key of registry.keys()) {
        const entry = registry.get(key);
        if (!entry) continue;
        const userFacing = entry.surface === 'user' || entry.surface === 'labs';
        if (userFacing && !entry.writableBy.includes('local')) {
            problems.push(`${key}: surface '${entry.surface}' but nobody on the web can write it`);
        }
        if (userFacing && entry.meta) {
            problems.push(`${key}: surface '${entry.surface}' cannot also be a lock key`);
        }
        // An experiment that cannot be turned off remotely does not go out to users.
        if (entry.surface === 'labs' && !entry.writableBy.includes('server')) {
            problems.push(`${key}: labs keys must be killable by the server`);
        }
        if (entry.type === 'enum' && (!entry.values || entry.values.length === 0)) {
            problems.push(`${key}: enum without values`);
        }
        if (!entry.title.trim() || !entry.description.trim()) {
            problems.push(`${key}: title and description are required`);
        }
    }
    return problems;
};
