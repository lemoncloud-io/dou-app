/**
 * Invite deeplink shapes and parsing for the home invite-accept flow.
 *
 * Invite deeplinks carry the `provider` marker, the invite `code`, the target `backend` endpoint,
 * and a `version` tag. Richer metadata (inviter, target site/channel) is fetched separately as a
 * `MyInviteView`; `InviteContext` bundles the two so the accept flow has both at hand.
 */
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

/** Parsed invite deeplink. Only `code` is guaranteed; the rest are optional. */
export interface InviteParams {
    provider?: string;
    code: string | null;
    backend?: string;
    version?: string;
}

/**
 * Fields the accept screen consumes that the backend denormalizes into the invite response but the
 * published `MyInviteView` (and its shallow `Head` types) does not yet declare. All optional: the UI
 * degrades gracefully (hides / falls back) until the backend ships them. See ADR-0016.
 */
export type InviteInfo = MyInviteView & {
    /** the target cloud id (present at runtime, absent on the published view). */
    cloudId?: string;
    /** invited place: intro copy + thumbnail (base64/url). */
    site$?: MyInviteView['site$'] & { intro?: string; thumbnail?: string };
    /** inviter avatar image url. */
    inviter$?: MyInviteView['inviter$'] & { image?: string };
    /** member count of the target group room (absent for 1:1). */
    memberCount?: number;
    /** invite-link expiry epoch (ms); drives the validity countdown. */
    expiredAt?: number;
};

/** Composed input for invite acceptance: URL params plus the fetched invite metadata. */
export interface InviteContext {
    params: InviteParams;
    info?: InviteInfo;
}

/** Extract invite parameters from a location search string (e.g. `location.search`). */
export const parseInviteDeeplink = (search: string): InviteParams => {
    const params = new URLSearchParams(search);
    const opt = (key: string): string | undefined => params.get(key) ?? undefined;
    return {
        provider: opt('provider'),
        code: params.get('code'),
        backend: opt('_backend'),
        version: opt('_version'),
    };
};

/**
 * True when the deeplink is a fully-formed invite entry that should trigger the accept popup.
 * Requires the explicit `provider=invite` marker plus both `code` and `_backend`; any missing
 * field means the link is ignored (no popup) per the home invite-detection contract.
 */
export const isInviteEntry = (params: InviteParams): boolean =>
    params.provider === 'invite' && !!params.code && !!params.backend;
