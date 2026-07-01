import type { DataRepositoriesV2 } from '@chatic/data';

import { normalizeName } from '../naming';

// Derive the write payload types straight from the repository method signatures so this stays in
// lockstep with the data layer without importing its internal input aliases.
type ChannelCreateInput = Parameters<DataRepositoriesV2['channel']['createChannel']>[0];
type ChannelUpdateInput = Parameters<DataRepositoriesV2['channel']['updateChannel']>[0];
type PlaceCreateInput = Parameters<DataRepositoriesV2['place']['createPlace']>[0];
type PlaceUpdateInput = Parameters<DataRepositoriesV2['place']['updatePlace']>[0];

// createChannel requires a stereo; the testbed create flow only asks for a name, so default to a
// private room (matches the web CreateChannelPage default).
const DEFAULT_CHANNEL_STEREO = 'private';

// Each builder trims/validates the name via the shared normalizeName rule and returns null when the
// name is unusable, so callers get a single "invalid → don't call the repo" gate. Centralizing the
// payload shape here (create stereo default, place-update keyed by `id`) keeps those decisions
// tested in one place instead of scattered across dialogs.
export const buildChannelCreate = (name: string): ChannelCreateInput | null => {
    const trimmed = normalizeName(name);
    return trimmed ? { stereo: DEFAULT_CHANNEL_STEREO, name: trimmed } : null;
};

export const buildChannelUpdate = (channelId: string, name: string): ChannelUpdateInput | null => {
    const trimmed = normalizeName(name);
    return channelId && trimmed ? { channelId, name: trimmed } : null;
};

export const buildPlaceCreate = (name: string): PlaceCreateInput | null => {
    const trimmed = normalizeName(name);
    return trimmed ? { name: trimmed } : null;
};

// updatePlace identifies the target by `id` (not `sid`) — see PlaceRepositoryV2.updatePlace.
export const buildPlaceUpdate = (placeId: string, name: string): PlaceUpdateInput | null => {
    const trimmed = normalizeName(name);
    return placeId && trimmed ? { id: placeId, name: trimmed } : null;
};
