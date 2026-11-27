import { AgentToolError } from './errors';

export type Params = Record<string, unknown>;

export const asParams = (input: unknown): Params =>
    typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Params) : {};

export const requireText = (params: Params, key: string): string => {
    const value = params[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new AgentToolError('bad_params', `${key} is required`);
    }
    return value;
};

export const optionalText = (params: Params, key: string): string | undefined => {
    const value = params[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export const optionalInt = (params: Params, key: string): number | undefined => {
    const value = params[key];
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
};

export const clampedInt = (params: Params, key: string, fallback: number, min: number, max: number): number =>
    Math.min(Math.max(optionalInt(params, key) ?? fallback, min), max);

export const textList = (params: Params, key: string): string[] => {
    const value = params[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
};

export const requireInChannel = (channelId: string, id: string, field: string): void => {
    if (id.includes(':') && !id.startsWith(`${channelId}:`)) {
        throw new AgentToolError('bad_params', `${field} does not belong to room ${channelId}`);
    }
};
