import { act, render } from '@testing-library/react';

import { runtime } from '@chatic/runtime-react';

import { BackgroundCloudsRunner, INVITED_CACHE_WAIT_MS } from './BackgroundCloudsRunner';

let mockRelayVerified = true;

jest.mock('@chatic/runtime-react', () => ({
    runtime: {
        connection: {
            useBackgroundClouds: jest.fn(),
            useReclaimOwnedClouds: jest.fn(),
            useSlotVerified: () => mockRelayVerified,
            RELAY_SLOT: 'default',
        },
    },
}));

let catalog: { clouds: { id: string }[]; hasCloudCatalog: boolean; isCloudsError: boolean };
let invited: { invitedClouds: { id: string }[]; hasReadInvitedClouds: boolean; ownedAlsoInvitedIds: string[] };

jest.mock('../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => catalog,
}));
jest.mock('../hooks/useInvitedClouds', () => ({
    useInvitedClouds: () => invited,
}));

const lastHandedOver = () => jest.mocked(runtime.connection.useBackgroundClouds).mock.calls.at(-1)?.[0];

beforeEach(() => {
    jest.clearAllMocks();
    mockRelayVerified = true;
    catalog = { clouds: [{ id: 'owned-1' }], hasCloudCatalog: true, isCloudsError: false };
    invited = { invitedClouds: [{ id: 'invited-1' }], hasReadInvitedClouds: true, ownedAlsoInvitedIds: ['owned-1'] };
});

afterEach(() => jest.useRealTimers());

describe('BackgroundCloudsRunner', () => {
    it('hands the runtime every owned and invited cloud', () => {
        render(<BackgroundCloudsRunner />);

        expect(lastHandedOver()).toEqual(['owned-1', 'invited-1']);
    });

    it('hands nothing over while the catalog has not answered', () => {
        catalog = { clouds: [], hasCloudCatalog: false, isCloudsError: false };

        render(<BackgroundCloudsRunner />);

        expect(lastHandedOver()).toBeNull();
    });

    describe('a failed catalog', () => {
        beforeEach(() => {
            catalog = { clouds: [], hasCloudCatalog: false, isCloudsError: true };
        });

        it('says nothing about the owned clouds before the relay is verified, so nothing is handed over', () => {
            mockRelayVerified = false;

            render(<BackgroundCloudsRunner />);

            expect(lastHandedOver()).toBeNull();
        });

        it('counts as an answer once the relay is verified, so the invited clouds are not held back', () => {
            render(<BackgroundCloudsRunner />);

            expect(lastHandedOver()).toEqual(['invited-1']);
        });
    });

    describe('an invited-cloud cache that has not answered', () => {
        beforeEach(() => {
            invited = { invitedClouds: [], hasReadInvitedClouds: false, ownedAlsoInvitedIds: [] };
        });

        it('holds the list back while it may still answer', () => {
            jest.useFakeTimers();
            render(<BackgroundCloudsRunner />);

            act(() => jest.advanceTimersByTime(INVITED_CACHE_WAIT_MS - 1));

            expect(lastHandedOver()).toBeNull();
        });

        it('counts as empty once the wait is over, so the owned clouds still get their sockets', () => {
            jest.useFakeTimers();
            render(<BackgroundCloudsRunner />);

            act(() => jest.advanceTimersByTime(INVITED_CACHE_WAIT_MS));

            expect(lastHandedOver()).toEqual(['owned-1']);
        });

        it('does not start the wait before the catalog has answered', () => {
            jest.useFakeTimers();
            catalog = { clouds: [], hasCloudCatalog: false, isCloudsError: false };
            render(<BackgroundCloudsRunner />);

            act(() => jest.advanceTimersByTime(INVITED_CACHE_WAIT_MS * 2));

            expect(lastHandedOver()).toBeNull();
        });
    });

    it('hands the owned clouds over for reclaiming, with the ones also cached as invited', () => {
        render(<BackgroundCloudsRunner />);

        expect(runtime.connection.useReclaimOwnedClouds).toHaveBeenCalledWith(['owned-1'], ['owned-1']);
    });
});
