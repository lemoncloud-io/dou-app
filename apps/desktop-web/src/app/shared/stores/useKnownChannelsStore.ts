import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { isCloudDm, type DomainChannel } from '@chatic/runtime';

import { dmCounterpartId } from '../utils/dmDisplay';
import { deviceStore, persistStorageOver } from '../../storage';

export interface KnownChannel {
    channelId: string;
    placeId: string;
    name: string;
    peerId?: string;
    self?: true;
    seenAt: number;
}

const KNOWN_LIMIT = 400;

interface KnownChannelsState {
    byCloud: Record<string, Record<string, KnownChannel>>;
    record: (
        cloudId: string,
        placeId: string,
        channels: Pick<DomainChannel, 'id' | 'name' | 'stereo' | 'cid' | 'memberIds' | '$join'>[],
        myUid?: string | null
    ) => void;
    forget: (cloudId: string) => void;
}

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
                        const isDm = isCloudDm(channel);
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
        {
            name: 'chatic-known-channels',
            storage: persistStorageOver(deviceStore),
            version: 2,
            migrate: () => ({ byCloud: {} }),
        }
    )
);
