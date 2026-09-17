import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** One channel the user has seen, remembered so the switcher can offer it again. */
interface KnownChannel {
    channelId: string;
    placeId: string;
    name: string;
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
    record: (cloudId: string, placeId: string, channels: { id?: string; name?: string }[]) => void;
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
            record: (cloudId, placeId, channels) =>
                set(state => {
                    if (!cloudId || !placeId || channels.length === 0) return state;
                    const current = state.byCloud[cloudId] ?? {};
                    const next = { ...current };
                    const seenAt = Date.now();
                    let changed = false;
                    for (const channel of channels) {
                        const channelId = channel.id;
                        if (!channelId) continue;
                        const name = channel.name ?? '';
                        const key = `${placeId}:${channelId}`;
                        const prev = next[key];
                        if (prev && prev.name === name) continue;
                        next[key] = { channelId, placeId, name, seenAt };
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
        // v1 keyed by channel id alone; dropping it costs one relearn from the cloud list.
        { name: 'chatic-known-channels', version: 1, migrate: () => ({ byCloud: {} }) }
    )
);
