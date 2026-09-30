import { beforeEach, describe, expect, it } from 'vitest';

import { useKnownChannelsStore } from './useKnownChannelsStore';

describe('useKnownChannelsStore.record', () => {
    beforeEach(() => {
        useKnownChannelsStore.setState({ byCloud: {} });
    });

    it('files a group under the place it was listed in', () => {
        useKnownChannelsStore
            .getState()
            .record('cloud-1', 'place-a', [{ id: 'ch-1', name: 'general', cid: 'cloud-1' }]);

        expect(Object.keys(useKnownChannelsStore.getState().byCloud['cloud-1'])).toEqual(['place-a:ch-1']);
    });

    // A 1:1 is listed only in the places its peer shares, so it is filed under each of those, with
    // its person, since its room name is only what the server set.
    it('files a cloud 1:1 with its person under the place it was listed in', () => {
        useKnownChannelsStore
            .getState()
            .record(
                'cloud-1',
                'place-a',
                [{ id: 'dm-1', name: 'room', cid: 'cloud-1', stereo: 'dm', memberIds: ['me', 'u-1'] }],
                'me'
            );

        expect(useKnownChannelsStore.getState().byCloud['cloud-1']['place-a:dm-1']).toMatchObject({
            channelId: 'dm-1',
            peerId: 'u-1',
        });
    });

    it('waits to file a cloud 1:1 until its members are known', () => {
        useKnownChannelsStore
            .getState()
            .record('cloud-1', 'place-a', [{ id: 'dm-1', name: 'room', cid: 'cloud-1', stereo: 'dm' }], 'me');

        expect(useKnownChannelsStore.getState().byCloud['cloud-1']).toBeUndefined();
    });

    // v1 keyed an entry by channel id alone; v2 entries stay valid as they are.
    it('drops a v1 index, whose keys could not tell places apart', () => {
        const { version, migrate } = useKnownChannelsStore.persist.getOptions();
        const filedDm = {
            byCloud: {
                'cloud-1': { 'place-a:dm-1': { channelId: 'dm-1', placeId: 'place-a', name: 'Aiden', seenAt: 1 } },
            },
        };

        expect(version).toBe(2);
        expect(migrate?.(filedDm, 1)).toEqual({ byCloud: {} });
    });
});
