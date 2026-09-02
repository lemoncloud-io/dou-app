/**
 * A request opts out of one or more transport rules by name. `networkLog` is the first (and so
 * far only) concrete case — log uploads must not be logged themselves, or a failed upload becomes
 * a log entry that pushes the next flush, which fails again. See ADR-0070 결정 3.
 */
export type BypassRule = 'networkLog';

export const isBypassed = (bypass: BypassRule[] | undefined, rule: BypassRule): boolean =>
    !!bypass && bypass.includes(rule);
