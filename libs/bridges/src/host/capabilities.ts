import { logger } from '@chatic/logger';

/**
 * What a shell said about its capabilities in `window.CHATIC_APP_CAPABILITIES`, before the page ran.
 *
 * One versioned object rather than one global per capability, because it is the only shape in which
 * a missing value means one thing:
 *
 * - `absent` — no object. A shell built before declarations existed; the legacy rule answers.
 * - `declared` — an object with a usable `version`. Its keys are read as given.
 * - `malformed` — something is there, but not an object with a positive integer `version`. A shell
 *   that tried to declare and got it wrong; nothing in it is trusted, and nothing is guessed.
 */
export type CapabilityDeclaration =
    | { readonly kind: 'absent' }
    | { readonly kind: 'declared'; readonly version: number; readonly values: Readonly<Record<string, unknown>> }
    | { readonly kind: 'malformed' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

export const readCapabilityDeclaration = (raw: unknown): CapabilityDeclaration => {
    if (raw === undefined || raw === null) return { kind: 'absent' };
    if (!isRecord(raw)) return { kind: 'malformed' };
    const { version, ...values } = raw;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { kind: 'malformed' };
    return { kind: 'declared', version, values };
};

/**
 * Where one capability's answer comes from.
 *
 * - `declaration` — the shell declared it; `value` is what it said, still to be parsed by the
 *   capability's own reader.
 * - `legacy` — the shell said nothing that covers it: either it declares nothing at all, or its
 *   declaration predates the capability. The capability's legacy rule answers.
 * - `unavailable` — the shell should have declared it and did not, or declared something unreadable.
 *   A bug in that shell, answered as "cannot", never guessed.
 */
export type CapabilitySource =
    | { readonly from: 'declaration'; readonly value: unknown }
    | { readonly from: 'legacy' }
    | { readonly from: 'unavailable'; readonly reason: 'missing' | 'malformed' };

/**
 * Resolves one capability against a declaration. `introducedIn` is the declaration version that first
 * carried `key`; a shell declaring an older version never knew the key, so its silence is not a bug
 * and the legacy rule answers for it.
 *
 * Every capability therefore has a legacy rule, including one added long after the first shells
 * declared. Where nothing the page did before declarations existed can be reproduced — the capability
 * is new — its legacy rule answers "unavailable", so a new key never needs a hand-written guess.
 */
export const resolveCapability = (
    declaration: CapabilityDeclaration,
    key: string,
    introducedIn: number
): CapabilitySource => {
    switch (declaration.kind) {
        case 'absent':
            return { from: 'legacy' };
        case 'malformed':
            return { from: 'unavailable', reason: 'malformed' };
        case 'declared':
            if (declaration.version < introducedIn) return { from: 'legacy' };
            if (!(key in declaration.values) || declaration.values[key] === undefined) {
                logger.warn('BRIDGE', '[HostProfile] capability missing from the shell declaration', {
                    key,
                    version: declaration.version,
                    introducedIn,
                });
                return { from: 'unavailable', reason: 'missing' };
            }
            return { from: 'declaration', value: declaration.values[key] };
    }
};
