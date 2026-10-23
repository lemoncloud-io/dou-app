import { describe, expect, it, vi } from 'vitest';

import { render } from '@testing-library/react';

const mockUseBackgroundClouds = vi.fn();
const mockUseReclaimOwnedClouds = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: {
            useBackgroundClouds: (cids: string[]) => mockUseBackgroundClouds(cids),
            useReclaimOwnedClouds: (owned: string[], alsoInvited: string[]) =>
                mockUseReclaimOwnedClouds(owned, alsoInvited),
        },
    },
}));
vi.mock('../shared', () => ({
    useClouds: () => ({
        clouds: [
            { id: 'default', kind: 'home' },
            { id: 'owned-1', kind: 'owned' },
            { id: 'invited-1', kind: 'invited' },
        ],
        ownedAlsoInvitedIds: ['owned-1'],
    }),
}));

import { BackgroundCloudsRunner } from './BackgroundCloudsRunner';

describe('BackgroundCloudsRunner', () => {
    it('hands the runtime every rail cloud except Home', () => {
        render(<BackgroundCloudsRunner />);

        expect(mockUseBackgroundClouds).toHaveBeenCalledWith(['owned-1', 'invited-1']);
    });

    it('hands the owned clouds over for reclaiming, with the ones also cached as invited', () => {
        render(<BackgroundCloudsRunner />);

        expect(mockUseReclaimOwnedClouds).toHaveBeenCalledWith(['owned-1'], ['owned-1']);
    });
});
