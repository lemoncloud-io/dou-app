import type { KnownChannel } from '../../../shared/stores/useKnownChannelsStore';

/**
 * The quick switcher's "in another place" rows, from the known-channels index of this cloud.
 *
 * A group row is named by its channel. A 1:1 carries its person (`peerId`) and is named after them —
 * its room name is only what the server set, and stands in until the person's name loads. It is
 * filed under every place that lists it, so it is offered once (the filing whose name or person
 * changed last — which place the row names does not decide where it opens), and not at all
 * when the open place lists it already. Group ids repeat
 * across places, so that de-duplication is for 1:1s only. A row whose place is gone, or that has no
 * name at all, is left out.
 */
type ElsewhereRow = { channelId: string; name: string; placeId: string; placeName: string };

export const elsewhereChannels = (
    known: Record<string, KnownChannel>,
    here: {
        placeId: string | null | undefined;
        placeName: ReadonlyMap<string, string>;
        listedIds: ReadonlySet<string>;
        peerName: (peerId: string) => string;
    }
): ElsewhereRow[] => {
    const seen = new Set<string>();
    const rows: ElsewhereRow[] = [];
    const candidates = Object.values(known).filter(
        entry =>
            entry.placeId !== here.placeId &&
            here.placeName.has(entry.placeId) &&
            !(entry.peerId && here.listedIds.has(entry.channelId))
    );
    for (const entry of candidates.sort((a, b) => b.seenAt - a.seenAt)) {
        if (entry.peerId && seen.has(entry.channelId)) continue;
        const name = (entry.peerId && here.peerName(entry.peerId)) || entry.name;
        if (!name) continue;
        if (entry.peerId) seen.add(entry.channelId);
        rows.push({
            channelId: entry.channelId,
            name,
            placeId: entry.placeId,
            placeName: here.placeName.get(entry.placeId) ?? '',
        });
    }
    return rows;
};
