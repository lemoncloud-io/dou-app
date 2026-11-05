import type { AppPermissionType, PermissionStatus } from '@chatic/bridge-messages';

/**
 * The bridge contract owns this union — the web asks for these by name, so a second copy here is
 * how `MICROPHONE` ended up reachable from the app but not from the web (ADR-0080 decision 11 step 2).
 * Re-exported so existing importers keep working.
 */
export type { AppPermissionType };

export type RequestedPermissionStatus = Exclude<PermissionStatus, 'UNAVAILABLE'>;

/** The permissions `status` reads: every one but notifications, which the OS reports apart. */
export type DevicePermissionType = Exclude<AppPermissionType, 'NOTIFICATIONS'>;

export interface IPermissionService {
    check(type: AppPermissionType): Promise<boolean>;
    /**
     * Where the permission stands, without asking: DENIED can still be asked for, BLOCKED cannot, and
     * UNAVAILABLE means the device has no such hardware. On Android the OS does not report BLOCKED
     * until a request has been refused for good, so a blocked permission reads DENIED here until then.
     */
    status(type: DevicePermissionType): Promise<PermissionStatus>;
    /**
     * Asks for the permission and reports how it ended. BLOCKED means the OS will no longer show
     * a prompt (the reader chose "don't ask again", or system policy blocks it): a DENIED request
     * can be asked again, a BLOCKED one can only be fixed in Settings — reporting it lets the web
     * tell those two apart.
     */
    request(type: AppPermissionType): Promise<RequestedPermissionStatus>;
}
