import { ConfigRegistry, findPolicyViolations } from '.';
import { ALL_MODULES } from './modules';

describe('ALL_MODULES — the full registry', () => {
    it('declares the expected number of keys', () => {
        const registry = ConfigRegistry.merge(ALL_MODULES);

        expect(registry.keys()).toHaveLength(88);
    });

    it('도메인 사이에 중복 키가 없다', () => {
        const onDuplicateKey = jest.fn();

        ConfigRegistry.merge(ALL_MODULES, onDuplicateKey);

        expect(onDuplicateKey).not.toHaveBeenCalled();
    });

    it('성립하지 않는 조합이 없다', () => {
        const registry = ConfigRegistry.merge(ALL_MODULES);

        expect(findPolicyViolations(registry)).toEqual([]);
    });

    it('이름과 설명이 빈 키가 없다', () => {
        const registry = ConfigRegistry.merge(ALL_MODULES);

        const blank = registry.keys().filter(key => {
            const entry = registry.get(key);
            return !entry?.title.trim() || !entry.description.trim();
        });

        expect(blank).toEqual([]);
    });

    it('keeps the surface distribution the registry doc states', () => {
        const registry = ConfigRegistry.merge(ALL_MODULES);
        const counts: Record<string, number> = { user: 0, labs: 0, dev: 0, internal: 0 };
        for (const key of registry.keys()) {
            const surface = registry.get(key)?.surface;
            if (surface) counts[surface] = (counts[surface] ?? 0) + 1;
        }

        expect(counts).toEqual({ user: 4, labs: 1, dev: 66, internal: 17 });
    });
});
