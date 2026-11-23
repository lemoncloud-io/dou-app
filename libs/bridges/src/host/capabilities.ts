import { logger } from '@chatic/logger';

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

export type CapabilitySource =
    | { readonly from: 'declaration'; readonly value: unknown }
    | { readonly from: 'legacy' }
    | { readonly from: 'unavailable'; readonly reason: 'missing' | 'malformed' };

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
