import type { SocketBindingConfig } from '../../socket';

/**
 * Socket-identity reboot key shared by SocketBinder (decides when to reboot a slot) and
 * SocketReauthBinder (decides when NOT to re-auth because a reboot already re-registers).
 * Deliberately `url|deviceId|wssType` and nothing else. `cid` is not in it because it is already the
 * slot's key — a different cid is a different slot, not a rebuild of this one. The identity token is
 * not in it so a token-only identity change (§6-7) never reads as a socket rebuild. The two binders
 * MUST agree on this key; computing it in one place keeps them from drifting.
 */
export const socketRebootKey = (config?: SocketBindingConfig): string =>
    config ? `${config.url}|${config.deviceId}|${config.wssType ?? ''}` : '';
