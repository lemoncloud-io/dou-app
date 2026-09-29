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

    it('leaves out a cloud 1:1, which every place already lists', () => {
        useKnownChannelsStore
            .getState()
            .record('cloud-1', 'place-a', [{ id: 'dm-1', name: 'Aiden', cid: 'cloud-1', stereo: 'dm' }]);

        expect(useKnownChannelsStore.getState().byCloud['cloud-1']).toBeUndefined();
    });

    it('drops an index persisted before cloud 1:1s were left out', () => {
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
