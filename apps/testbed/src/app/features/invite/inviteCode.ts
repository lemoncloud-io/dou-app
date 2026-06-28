// Invite payload bundled into a single copyable code. testbed has no deeplink infra, so the
// invite carries everything the accepter needs to reach the target: the verify code plus the
// cid/sid/channelId targets and the cloud endpoints. Encoded as base64(JSON) for copy/paste.
export interface InvitePayload {
    /** invite verify code (uuid) from requestInvite */
    code: string;
    /** target cloud id (inviter's current cloud) */
    cid: string;
    /** target site id */
    sid: string;
    /** channel to enter after switching */
    channelId: string;
    /** cloud REST endpoint (for login-invite) */
    backend?: string;
    /** cloud WebSocket endpoint */
    wss?: string;
    /** display name of the target cloud */
    cloudName?: string;
}

const REQUIRED_KEYS: Array<keyof InvitePayload> = ['code', 'cid', 'sid', 'channelId'];

// Unicode-safe base64 (btoa only handles latin1). Cloud names may contain non-ASCII.
const toBase64 = (text: string): string => btoa(unescape(encodeURIComponent(text)));
const fromBase64 = (b64: string): string => decodeURIComponent(escape(atob(b64)));

export interface InviteLinkParams {
    code?: string;
    backend?: string;
    siteId?: string;
}

/**
 * The server returns a deeplink (`MyInviteView.Location`) that carries the real login-invite
 * code plus endpoint hints as query params (`code`, `_backend`, `_siteId` — see apps/web
 * LoginPage). The raw InviteModel.code uuid is NOT accepted by login-invite, so we read the
 * code from here instead. Falls back to a regex when Location isn't an absolute URL.
 */
export const parseInviteLocation = (location?: string): InviteLinkParams => {
    if (!location) return {};
    try {
        const url = new URL(location);
        const p = url.searchParams;
        return {
            code: p.get('code') ?? undefined,
            backend: p.get('_backend') ?? undefined,
            siteId: p.get('_siteId') ?? undefined,
        };
    } catch {
        const match = /[?&]code=([^&]+)/.exec(location);
        return match ? { code: decodeURIComponent(match[1]) } : {};
    }
};

/** Serializes an invite payload into a single copyable code string. */
export const encodeInvite = (payload: InvitePayload): string => toBase64(JSON.stringify(payload));

/**
 * Parses a pasted invite code back into a payload. Returns null on malformed input or when a
 * required target field is missing, so callers can show a clear error instead of half-switching.
 */
export const decodeInvite = (text: string): InvitePayload | null => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    try {
        const parsed = JSON.parse(fromBase64(trimmed)) as Partial<InvitePayload>;
        for (const key of REQUIRED_KEYS) {
            if (typeof parsed[key] !== 'string' || !(parsed[key] as string).length) {
                return null;
            }
        }
        return parsed as InvitePayload;
    } catch {
        return null;
    }
};
