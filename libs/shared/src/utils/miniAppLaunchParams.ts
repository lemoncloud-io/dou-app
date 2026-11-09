import type { SubWebViewTrust } from './subWebViewTrust';

/**
 * The `params` a mini app is opened with: who is looking, in which cloud and place. Ids and display
 * names, and nothing that authenticates — no session token, relay JWT or cloud token, and no key
 * named for one, so a page cannot mistake a field for a credential. A page that needs to act for
 * the user waits for a scoped token, which is a later step.
 *
 * `user.isOwner` goes to the hub alone (`firstParty`). The hub uses it to offer the owner the link
 * settings; a reviewed or external page has no use for it, and telling a third party which visitor
 * owns the cloud is information it was never asked to hold.
 */
export interface MiniAppLaunchParams {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    /** `id` is the user's id in this cloud, not a global one: a page sees a different id per cloud. */
    user: { id: string; name: string; isOwner?: boolean };
}

/** What the web knows when it opens a mini app. */
export interface MiniAppLaunchInput {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    /** `placeNick` is the nick in the open place's profile; `profileName` the cloud profile's name. */
    user: { id: string; placeNick?: string | null; profileName?: string | null };
    isOwner: boolean;
}

/**
 * The longest a name in the params may be, in characters. The three names, even if every character
 * serialized as a six-character escape, take 3,600 characters — far inside the 16 KiB a sub WebView's
 * params may take. The three ids are not cut: they are server-issued keys, short by construction, and
 * a cut id would name a different record.
 */
export const MINI_APP_NAME_LIMIT = 200;

// Cut on code points so a surrogate pair is never split into a lone half.
const nameOf = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? '';
    const chars = Array.from(trimmed);
    return chars.length > MINI_APP_NAME_LIMIT ? chars.slice(0, MINI_APP_NAME_LIMIT).join('') : trimmed;
};

/** The params for a page of `trust`. The user's name is the place nick, else the cloud profile's. */
export const buildMiniAppLaunchParams = (input: MiniAppLaunchInput, trust: SubWebViewTrust): MiniAppLaunchParams => {
    const name = nameOf(input.user.placeNick) || nameOf(input.user.profileName);
    return {
        cloud: { id: input.cloud.id, name: nameOf(input.cloud.name) },
        place: input.place ? { id: input.place.id, name: nameOf(input.place.name) } : null,
        user:
            trust === 'firstParty' ? { id: input.user.id, name, isOwner: input.isOwner } : { id: input.user.id, name },
    };
};

/**
 * Whether the signed-in user owns the selected cloud: a cloud they subscribed to themselves — not
 * the default cloud everyone starts in, and not one they were invited into.
 */
export const isCloudOwnerOf = (cloud: { isDefaultCloud: boolean; isInvitedCloud: boolean }): boolean =>
    !cloud.isDefaultCloud && !cloud.isInvitedCloud;
