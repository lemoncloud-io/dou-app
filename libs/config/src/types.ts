export type Stage = 'LOCAL' | 'DEV' | 'PROD';

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'web';

export type Lane = 'serverEnforced' | 'shell' | 'local' | 'serverDefault';

export type ValueOrigin = Lane | 'stageRule' | 'default';

export type Writer = 'shell' | 'local' | 'server';

export type Surface = 'user' | 'labs' | 'dev' | 'internal';

export type ValueType = 'boolean' | 'string' | 'number' | 'enum' | 'json';

export type Persist = 'shell' | 'local' | 'session' | 'none';

export type AppliesAt = 'live' | 'reconnect' | 'restart';

export interface ConfigEntry<T = unknown> {
    title: string;
    description: string;
    type: ValueType;
    values?: readonly T[];
    pattern?: RegExp;
    defaultValue: T;
    byStage?: Partial<Record<Stage, T>>;
    byPlatform?: Partial<Record<Platform, T>>;
    envDefaultKey?: string;
    surface: Surface;
    writableBy: readonly Writer[];
    persist: Persist;
    appliesAt?: AppliesAt;
    meta?: boolean;
}

export interface ConfigSnapshot<T = unknown> {
    key: string;
    entry: ConfigEntry<T>;
    value: T;
    origin: ValueOrigin;
    isOverridden: boolean;
    canWrite: readonly Writer[];
}

export type ConfigChangeListener = (changedKeys: readonly string[]) => void;

export type SetRejection = 'unknownKey' | 'laneNotAllowed' | 'locked' | 'invalidValue' | 'notWired';

export type SetResult = { ok: true } | { ok: false; reason: SetRejection };

export type ConfigRegistryModule = Readonly<Record<string, ConfigEntry>>;
