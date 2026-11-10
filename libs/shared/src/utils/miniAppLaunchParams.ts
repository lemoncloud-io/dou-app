import type { MiniAppLaunchParams } from '@chatic/bridge-messages';

import type { MiniAppLink } from './miniAppLinks';
import type { SubWebViewTrust } from './subWebViewTrust';

/** What the web knows when it opens a mini app. */
export interface MiniAppLaunchInput {
    cloud: { id: string; name: string };
    place: { id: string; name: string } | null;
    /** `placeNick` is the nick in the open place's profile; `profileName` the cloud profile's name. */
    user: { id: string; placeNick?: string | null; profileName?: string | null };
    isOwner: boolean;
    /** The cloud's mini apps, listed for the hub. */
    miniApps?: readonly MiniAppLink[];
}

/**
 * The longest a name in the params may be, in characters. The three names, even if every character
 * serialized as a six-character escape, take 3,600 characters — far inside the 16 KiB a sub WebView's
 * params may take. The three ids are not cut: they are server-issued keys, short by construction, and
 * a cut id would name a different record. The hub's mini app list adds at most ten entries of a
 * 30-character name, a host and an id, which keeps the whole well under that limit.
 */
export const MINI_APP_NAME_LIMIT = 200;

// Cut on code points so a surrogate pair is never split into a lone half.
const nameOf = (value: string | null | undefined): string => {
    const trimmed = value?.trim() ?? '';
    const chars = Array.from(trimmed);
    return chars.length > MINI_APP_NAME_LIMIT ? chars.slice(0, MINI_APP_NAME_LIMIT).join('') : trimmed;
};

/**
 * The `params` a page of `trust` is opened with: who is looking, in which cloud and place. The shape
 * is the wire type `MiniAppLaunchParams`, which the published page SDK declares too. Ids and display
 * names, and nothing that authenticates — no session token, relay JWT or cloud token, and no key
 * named for one, so a page cannot mistake a field for a credential. A page that needs to act for the
 * user waits for a scoped token, which is a later step. The user's name is the place nick, else the
 * cloud profile's.
 *
 * `user.isOwner` and `miniApps` go to the hub alone (`firstParty`). The hub uses the first to offer
 * the owner the link settings and the second to list the cloud's mini apps; a reviewed or external
 * page has no use for either, and telling a third party which visitor owns the cloud, or which other
 * sites the cloud uses, is information it was never asked to hold.
 */
export const buildMiniAppLaunchParams = (input: MiniAppLaunchInput, trust: SubWebViewTrust): MiniAppLaunchParams => {
    const name = nameOf(input.user.placeNick) || nameOf(input.user.profileName);
    const base = {
        cloud: { id: input.cloud.id, name: nameOf(input.cloud.name) },
        place: input.place ? { id: input.place.id, name: nameOf(input.place.name) } : null,
    };
    if (trust !== 'firstParty') return { ...base, user: { id: input.user.id, name } };
    return {
        ...base,
        user: { id: input.user.id, name, isOwner: input.isOwner },
        // The host, not the address: the hub only lists them, and hands back the id to open.
        miniApps: (input.miniApps ?? []).map(link => ({ id: link.id, name: link.name, host: new URL(link.url).host })),
    };
};
