export const TIERS = ['off', 'read', 'write', 'full'] as const;

export type Tier = (typeof TIERS)[number];

export interface RateLimit {
    perMinute: number;
    perHour: number;
}

export interface Settings {
    tier: Tier;
    allowRooms: string[];
    rateLimit: RateLimit;
}

export const DEFAULT_RATE_LIMIT: Readonly<RateLimit> = { perMinute: 10, perHour: 100 };

export const READ_RATE_LIMIT: Readonly<RateLimit> = { perMinute: 30, perHour: 300 };

export const defaultSettings = (): Settings => ({
    tier: 'off',
    allowRooms: [],
    rateLimit: { ...DEFAULT_RATE_LIMIT },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isTier = (value: unknown): value is Tier => TIERS.some(tier => tier === value);

const limitOf = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;

const decode = (input: unknown): unknown => {
    if (typeof input !== 'string') return input;
    try {
        return JSON.parse(input);
    } catch {
        return undefined;
    }
};

export const parseSettings = (input: unknown): Settings => {
    const raw = decode(input);
    const settings = defaultSettings();
    if (!isRecord(raw)) return settings;
    if ('tier' in raw) settings.tier = isTier(raw.tier) ? raw.tier : 'off';
    if (Array.isArray(raw.allowRooms)) {
        settings.allowRooms = raw.allowRooms.filter((room): room is string => typeof room === 'string');
    }
    if (isRecord(raw.rateLimit)) {
        settings.rateLimit = {
            perMinute: limitOf(raw.rateLimit.perMinute, DEFAULT_RATE_LIMIT.perMinute),
            perHour: limitOf(raw.rateLimit.perHour, DEFAULT_RATE_LIMIT.perHour),
        };
    }
    return settings;
};

export const allowsRoom = (settings: Settings, channelId: string): boolean => settings.allowRooms.includes(channelId);

export const canWrite = (settings: Settings): boolean => settings.tier === 'write' || settings.tier === 'full';
