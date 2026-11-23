import type { KnownChannel } from '../../../shared/stores/useKnownChannelsStore';

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
    const isOneRoom = (entry: KnownChannel) => !!entry.peerId || !!entry.self;
    const rows: ElsewhereRow[] = [];
    const candidates = Object.values(known).filter(
        entry =>
            entry.placeId !== here.placeId &&
            here.placeName.has(entry.placeId) &&
            !(isOneRoom(entry) && here.listedIds.has(entry.channelId))
    );
    for (const entry of candidates.sort((a, b) => b.seenAt - a.seenAt)) {
        if (isOneRoom(entry) && seen.has(entry.channelId)) continue;
        const name = (entry.peerId && here.peerName(entry.peerId)) || entry.name;
        if (!name) continue;
        if (isOneRoom(entry)) seen.add(entry.channelId);
        rows.push({
            channelId: entry.channelId,
            name,
            placeId: entry.placeId,
            placeName: here.placeName.get(entry.placeId) ?? '',
        });
    }
    return rows;
};
