import { isValidValue } from '../resolve/validate';
import type { ConfigEntry, ConfigRegistryModule } from '../types';

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
        if (entry.surface === 'labs' && !entry.writableBy.includes('server')) {
            problems.push(`${key}: labs keys must be killable by the server`);
        }
        if (entry.type === 'enum' && (!entry.values || entry.values.length === 0)) {
            problems.push(`${key}: enum without values`);
        }
        if (entry.pattern && (entry.type !== 'string' || !isValidValue(entry, entry.defaultValue))) {
            problems.push(`${key}: a pattern needs a string key whose defaultValue matches it`);
        }
        if (!entry.title.trim() || !entry.description.trim()) {
            problems.push(`${key}: title and description are required`);
        }
    }
    return problems;
};
