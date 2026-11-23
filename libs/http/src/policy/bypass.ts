export type BypassRule = 'networkLog';

export const isBypassed = (bypass: BypassRule[] | undefined, rule: BypassRule): boolean =>
    !!bypass && bypass.includes(rule);
