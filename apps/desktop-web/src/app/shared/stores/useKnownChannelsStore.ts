import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isCloudWideChannel, type DomainChannel } from '@chatic/data';

// The file, not the barrel: the utils barrel reaches back into the stores.
import { dmCounterpartId } from '../utils/dmDisplay';

/** One channel the user has seen, remembered so the switcher can offer it again. */
export interface KnownChannel {
    channelId: string;
    placeId: string;
    name: string;
    /** A cloud 1:1's other person; the switcher names the row after them, not the room. */
    peerId?: string;
    /** My notes-to-self room, which — like a 1:1 — is one room filed under every place listing it. */
    self?: true;
    /** When it was last listed, so a stale place drops out of the index first. */
    seenAt: number;
}

/** Ceiling per cloud. Enough for a wide workspace, small enough to stay cheap. */
const KNOWN_LIMIT = 400;

interface KnownChannelsState {
    /**
     * cloudId → `placeId:channelId` → what we know about it. Channel ids repeat
     * across places, so the id alone would let one place's channel overwrite another's.
     */
    byCloud: Record<string, Record<string, KnownChannel>>;
    record: (
        cloudId: string,
        placeId: string,
        channels: Pick<DomainChannel, 'id' | 'name' | 'stereo' | 'cid' | 'memberIds' | '$join'>[],
        myUid?: string | null
    ) => void;
    forget: (cloudId: string) => void;
}

/**
 * An index of channels per cloud, built from the places the user actually opens.
 *
 * The quick switcher could only offer the open place's channels, because that is
 * the only list the app streams: a person with channels spread over several
 * places had to guess which place held the one they wanted, switch to it, and
 * then search. The switcher now reads this index for the rest of the cloud and
 * hands a pick to the same cross-place landing path that saved items use.
 *
 * Persisted, so the index survives a relaunch and the switcher is useful on the
 * first keystroke rather than after a tour of the rail. It holds names, never
 * message content.
 */
export const useKnownChannelsStore = create<KnownChannelsState>()(
    persist(
        set => ({
            byCloud: {},
            record: (cloudId, placeId, channels, myUid = null) =>
                set(state => {
                    if (!cloudId || !placeId || channels.length === 0) return state;
                    const current = state.byCloud[cloudId] ?? {};
                    const next = { ...current };
                    const seenAt = Date.now();
                    let changed = false;
                    for (const channel of channels) {
                        const channelId = channel.id;
                        if (!channelId) continue;
                        // Callers pass a cloud 1:1 only for the places that list it. One whose
                        // members have not arrived waits for a later record: filed without its
                        // person it would read as a group row.
                        const isDm = isCloudWideChannel(channel);
                        const peerId = isDm ? dmCounterpartId(channel, myUid, channel.$join?.userId) : undefined;
                        if (isDm && !peerId) continue;
                        const self = channel.stereo === 'self';
                        const name = channel.name ?? '';
                        const key = `${placeId}:${channelId}`;
                        const prev = next[key];
                        if (prev && prev.name === name && prev.peerId === peerId && !!prev.self === self) continue;
                        next[key] = {
                            channelId,
                            placeId,
                            name,
                            seenAt,
                            ...(peerId ? { peerId } : {}),
                            ...(self ? { self: true as const } : {}),
                        };
                        changed = true;
                    }
                    // A channel that left this place (deleted, or left) stays in the
                    // index until it ages out; the pick path tolerates a miss.
                    if (!changed) return state;
                    const entries = Object.values(next);
                    const trimmed =
                        entries.length <= KNOWN_LIMIT
                            ? next
                            : Object.fromEntries(
                                  [...entries]
                                      .sort((a, b) => b.seenAt - a.seenAt)
                                      .slice(0, KNOWN_LIMIT)
                                      .map(entry => [`${entry.placeId}:${entry.channelId}`, entry])
                              );
                    return { byCloud: { ...state.byCloud, [cloudId]: trimmed } };
                }),
            forget: cloudId =>
                set(state => {
                    if (!state.byCloud[cloudId]) return state;
                    const byCloud = { ...state.byCloud };
                    delete byCloud[cloudId];
                    return { byCloud };
                }),
        }),
        // v1 keyed by channel id alone, and could hold cloud 1:1s filed under whichever place they
        // were seen in; dropping it costs one relearn from the cloud list. v2 entries stay valid:
        // a 1:1 now filed under its listing places only adds the optional `peerId`.
        { name: 'chatic-known-channels', version: 2, migrate: () => ({ byCloud: {} }) }
    )
);
