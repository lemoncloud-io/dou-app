import type { AppPermissionType } from '@chatic/app-messages';

/**
 * The bridge contract owns this union — the web asks for these by name, so a second copy here is
 * how `MICROPHONE` ended up reachable from the app but not from the web (ADR-0080 decision 11 step 2).
 * Re-exported so existing importers keep working.
 */
export type { AppPermissionType };

export interface IPermissionService {
    check(type: AppPermissionType): Promise<boolean>;
    request(type: AppPermissionType): Promise<boolean>;
    /**
     * Whether the OS will no longer show a prompt for this permission (the reader
     * chose "don't ask again" or the system policy blocks it). A denied request
     * that is not blocked can be asked again; a blocked one can only be fixed in
     * Settings — the web tells those two apart.
     */
    isBlocked(type: AppPermissionType): Promise<boolean>;
}
