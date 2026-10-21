import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type * as ChannelLabel from '../../../shared/utils/channelLabel';

type ChannelLabelModule = typeof ChannelLabel;

const catalog = [{ id: 'c1', name: '', status: 'suspended', email: 'owner@example.com' }];
const cached = [{ id: 'c2', name: 'Cached', cloudType: 'invited' }];
const rail = [
    { id: 'default', name: 'Home', status: 'active', kind: 'home' },
    { id: 'c1', name: '', status: 'suspended', kind: 'owned' },
    { id: 'c3', name: '#cloud/1001494/3', status: 'error', kind: 'owned' },
];
const joined = { c4: { id: 'c4', name: 'Joined' } };
const refetchClouds = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                cloud: {
                    observeList: (callback: (result: { list: unknown[] }) => void) => {
                        callback({ list: cached });
                        return () => undefined;
                    },
                },
            }),
        },
    },
}));
// The real label rule, so the test pins the switcher's notion of untitled rather than a copy of it.
vi.mock('../../../shared', async () => ({
    useCloudSessionCatalog: () => ({ clouds: catalog, isFetchingClouds: false, isCloudsError: false, refetchClouds }),
    useClouds: () => ({ clouds: rail }),
    useJoinedCloudsStore: (select: (s: { joinedClouds: typeof joined }) => unknown) => select({ joinedClouds: joined }),
    cloudLabel: (await vi.importActual<ChannelLabelModule>('../../../shared/utils/channelLabel')).cloudLabel,
}));

import { DebugCloudsPage } from './DebugCloudsPage';

describe('DebugCloudsPage', () => {
    const originalClipboard = navigator.clipboard;

    beforeEach(() => {
        refetchClouds.mockReset();
    });

    afterEach(() => {
        Object.assign(navigator, { clipboard: originalClipboard });
    });

    it('shows the catalog row raw, including the fields the switcher drops', () => {
        render(<DebugCloudsPage />);

        expect(screen.getByText('Relay catalog (1)')).toBeTruthy();
        expect(screen.getByText(/"status": "suspended"/)).toBeTruthy();
        expect(screen.getByText(/"email": "owner@example.com"/)).toBeTruthy();
    });

    it('marks a rail entry untitled the way the switcher does, generated names included', () => {
        render(<DebugCloudsPage />);

        expect(screen.getByText('owned · c1 · (untitled) · suspended')).toBeTruthy();
        expect(screen.getByText('owned · c3 · (untitled) · error')).toBeTruthy();
    });

    it('shows the invite-joined clouds the rail also reads', () => {
        render(<DebugCloudsPage />);

        expect(screen.getByText('Joined by invite (1)')).toBeTruthy();
        expect(screen.getByText(/"name": "Joined"/)).toBeTruthy();
    });

    it('shows the local cache rows next to the catalog', () => {
        render(<DebugCloudsPage />);

        expect(screen.getByText('Local cache (1)')).toBeTruthy();
        expect(screen.getByText(/"name": "Cached"/)).toBeTruthy();
    });

    it('copies every source as one JSON document', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.assign(navigator, { clipboard: { writeText } });
        render(<DebugCloudsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
        const report = JSON.parse(writeText.mock.calls[0][0]);
        expect(report.catalog).toEqual(catalog);
        expect(report.cached).toEqual(cached);
        expect(report.joined).toEqual(joined);
        expect(report.rail).toEqual(rail);
    });

    it('says so when the clipboard refuses the copy', async () => {
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
        render(<DebugCloudsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy());
    });

    it('re-reads the catalog on reload', () => {
        render(<DebugCloudsPage />);

        fireEvent.click(screen.getByRole('button', { name: 'Reload catalog' }));

        expect(refetchClouds).toHaveBeenCalledTimes(1);
    });
});
