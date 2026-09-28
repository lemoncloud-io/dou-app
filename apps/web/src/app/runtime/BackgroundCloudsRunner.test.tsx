import { render } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { BackgroundCloudsRunner } from './BackgroundCloudsRunner';

jest.mock('@chatic/app-runtime', () => ({
    runtime: { connection: { useBackgroundClouds: jest.fn() } },
}));
jest.mock('../hooks/useCloudCatalog', () => ({
    useCloudSessionCatalog: () => ({ clouds: [{ id: 'owned-1' }] }),
}));
jest.mock('../hooks/useInvitedClouds', () => ({
    useInvitedClouds: () => ({ invitedClouds: [{ id: 'invited-1' }] }),
}));

describe('BackgroundCloudsRunner', () => {
    it('hands the runtime every owned and invited cloud', () => {
        render(<BackgroundCloudsRunner />);

        expect(runtime.connection.useBackgroundClouds).toHaveBeenCalledWith(['owned-1', 'invited-1']);
    });
});
