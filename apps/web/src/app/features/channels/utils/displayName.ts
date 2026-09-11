import { isRawIdNick } from './nick';

/**
 * The one display-name chain for people in a channel.
 *
 * Every surface that names somebody — message rows, the thread root, reaction chip labels, the
 * reactor sheet, the settings member list — has to reach the same answer, or the same person
 * wears two names one line apart. That is what ADR-0039 exists to prevent, and four hand-copied
 * chains across two pages is how it drifts.
 *
 * Precedence, highest first:
 *  1. the site profile's nick — what the person chose for THIS place,
 *  2. the member row's nick, then its name — the channel-wide user cache,
 *  3. the chat row's embedded `owner$.name` — a snapshot from when the row was written,
 *  4. a label.
 *
 * Every candidate passes `isRawIdNick` first, because the server seeds an unnamed user's `name`
 * with their account UUID (the same flow that seeds join nicks — see nick.ts). A value like
 * `f7fa3ac3-50e9-425c-b8d5-a6214b9dee50` satisfies "has a name" while being unreadable, leaking an
 * internal identifier, and reading like data corruption rather than like a person. It has to fall
 * THROUGH, not win. Step 4 is likewise a label and never the id.
 */

/** Minimal shape of a site-profile row; the real one carries much more. */
interface ProfileLike {
    nick?: string;
}

/** Minimal shape of a member row from the channel's user cache. */
interface MemberLike {
    nick?: string;
    name?: string;
}

export interface DisplayNameSources {
    profileMap: Map<string, ProfileLike>;
    memberById: Map<string, MemberLike>;
    /** The signed-in user, so an unresolved self reads as "me" rather than as a stranger. */
    userId?: string | null;
    /** Localized "알 수 없는 사용자". */
    unknownLabel: string;
    /** Localized "나" — used only when the chain fails for the signed-in user themselves. */
    meLabel: string;
}

/** A candidate is usable when it survives trimming and is not a server-seeded raw id. */
const asName = (value: string | undefined, id: string): string | undefined => {
    const trimmed = value?.trim();
    if (!trimmed || isRawIdNick(trimmed, id)) return undefined;
    return trimmed;
};

/** Whichever of the two labels fits: my own unresolved name is not an unknown person's. */
const fallbackFor = (id: string, sources: DisplayNameSources): string =>
    sources.userId && id === sources.userId ? sources.meLabel : sources.unknownLabel;

/**
 * Name for a user id — the form the reaction chips and the reactor sheet need, where there is a
 * reactor id and no chat row to read an embedded name off.
 */
export const resolveUserName = (id: string, sources: DisplayNameSources): string => {
    if (!id) return sources.unknownLabel;
    const profile = sources.profileMap.get(id);
    const member = sources.memberById.get(id);
    return (
        asName(profile?.nick, id) ?? asName(member?.nick, id) ?? asName(member?.name, id) ?? fallbackFor(id, sources)
    );
};

/** Minimal shape of a chat row for naming purposes. */
interface ChatLike {
    ownerId?: string;
    owner$?: { name?: string };
}

/**
 * Name for a chat row's author. Same chain as `resolveUserName` plus the row's own embedded
 * `owner$.name`, which sits BELOW the caches: it is a snapshot taken when the row was written, so
 * a rename since then would otherwise resurrect the old name.
 */
export const resolveChatOwnerName = (chat: ChatLike, sources: DisplayNameSources): string => {
    const id = chat.ownerId ?? '';
    const embedded = asName(chat.owner$?.name, id);
    if (!id) return embedded ?? sources.unknownLabel;
    const profile = sources.profileMap.get(id);
    const member = sources.memberById.get(id);
    return (
        asName(profile?.nick, id) ??
        asName(member?.nick, id) ??
        asName(member?.name, id) ??
        embedded ??
        fallbackFor(id, sources)
    );
};
