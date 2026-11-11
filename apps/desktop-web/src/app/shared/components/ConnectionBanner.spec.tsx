import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useConnectivity } = vi.hoisted(() => ({ useConnectivity: vi.fn() }));

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        connection: { useConnectivity },
        session: { SWITCH_SITE_MUTATION_KEY: ['switch-site'], SWITCH_CLOUD_MUTATION_KEY: ['switch-cloud'] },
    },
}));

import i18n from '../../../i18n';
import { ConnectionBanner } from './ConnectionBanner';

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('ConnectionBanner', () => {
    afterEach(() => vi.clearAllMocks());

    it('shows Reconnecting while the socket is coming up', () => {
        useConnectivity.mockReturnValue('reconnecting');
        render(<ConnectionBanner />, { wrapper });

        expect(screen.getByRole('status').textContent).toContain(i18n.t('connection.reconnecting'));
    });

    it('stays quiet about a socket still coming up when told the person is not using it', () => {
        useConnectivity.mockReturnValue('reconnecting');
        render(<ConnectionBanner quiet />, { wrapper });

        expect(screen.queryByRole('status')).toBeNull();
    });

    it('still reports a lost network when quiet, since that explains a failing lookup', () => {
        useConnectivity.mockReturnValue('offline');
        render(<ConnectionBanner quiet />, { wrapper });

        expect(screen.getByRole('status').textContent).toContain(i18n.t('connection.offline'));
    });
});
