import type { SocketBindingConfig } from '../socket';

/**
 * Socket-identity reboot key shared by SocketBinder (decides when to reboot a slot) and
 * SocketReauthBinder (decides when NOT to re-auth because a reboot already re-registers).
 * Deliberately `url|deviceId|wssType` and nothing else — `cid` and the identity token are excluded
 * so a cid-only cloud switch (§8-4) or a token-only identity change (§6-7) never reads as a socket
 * rebuild. The two binders MUST agree on this key; computing it in one place keeps them from drifting.
 */
export const socketRebootKey = (config?: SocketBindingConfig): string =>
    config ? `${config.url}|${config.deviceId}|${config.wssType ?? ''}` : '';
