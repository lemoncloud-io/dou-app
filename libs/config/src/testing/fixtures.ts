import type { ConfigRuntimePorts, IConfigEnvAdapter, StorageLike } from '../ports';
import type { ConfigEntry, ConfigRegistryModule, Platform, Stage } from '../types';

/** A minimal entry, so each test only states the field it is about. */
export const entry = (overrides: Partial<ConfigEntry> = {}): ConfigEntry => ({
    title: '테스트 키',
    description: '테스트용.',
    type: 'boolean',
    defaultValue: false,
    surface: 'dev',
    writableBy: ['shell', 'local'],
    persist: 'none',
    ...overrides,
});

export const UNLOCK_ENTRY = entry({
    title: '오버라이드 잠금 해제',
    description: '웹 오버라이드 레인을 살린다.',
    defaultValue: true,
    byStage: { PROD: false },
    writableBy: ['shell', 'local'],
    persist: 'session',
    meta: true,
});

export const moduleOf = (keys: Record<string, ConfigEntry>): ConfigRegistryModule => keys;

export const envAdapter = (
    stage: Stage = 'DEV',
    buildStage: Stage = stage,
    platform: Platform = 'web'
): IConfigEnvAdapter => ({
    stage: () => stage,
    buildStage: () => buildStage,
    platform: () => platform,
    raw: () => undefined,
});

export const memoryStorage = (): StorageLike & { dump: () => Record<string, string> } => {
    const map = new Map<string, string>();
    return {
        getItem: key => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: key => void map.delete(key),
        dump: () => Object.fromEntries(map),
    };
};

export const ports = (overrides: Partial<ConfigRuntimePorts> = {}): ConfigRuntimePorts => ({
    env: envAdapter(),
    storage: { local: memoryStorage(), session: memoryStorage() },
    ...overrides,
});
