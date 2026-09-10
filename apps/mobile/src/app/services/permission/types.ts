import type { AppPermissionType } from '@chatic/app-messages';

/**
 * The bridge contract owns this union — the web asks for these by name, so a second copy here is
 * how `MICROPHONE` ended up reachable from the app but not from the web (ADR-0080 결정 11 단계 2).
 * Re-exported so existing importers keep working.
 */
export type { AppPermissionType };

export interface IPermissionService {
    check(type: AppPermissionType): Promise<boolean>;
    request(type: AppPermissionType): Promise<boolean>;
}
