/**
 * `pages/memberships/MembershipsPage.spec.tsx`
 *
 * A row belongs to the relay it was read from: its `userId` on the other relay is somebody else.
 * Switching stage therefore has to close the open row, or an override or refund aimed at the new
 * relay would land on that other user.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAdminMemberships = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: {
            useRuntimeRepositories: () => ({
                subscription: {
                    fetchAdminMemberships,
                    fetchAdminClouds: vi.fn().mockResolvedValue({ list: [] }),
                    fetchPlans: vi.fn().mockResolvedValue({ list: [] }),
                },
            }),
        },
    },
}));

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));

import { MembershipsPage } from './MembershipsPage';

beforeEach(() => {
    vi.stubEnv('VITE_DOU_ENDPOINT', 'https://api.example.com/dou-v1');
    fetchAdminMemberships.mockResolvedValue({
        list: [{ id: 'MS1000904', userId: '1000904', platform: 'portone', status: 'active' }],
        total: 1,
    });
});

describe('MembershipsPage', () => {
    it('closes the open row when the stage changes', async () => {
        render(
            <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
                <MemoryRouter initialEntries={['/memberships?stage=v1']}>
                    <MembershipsPage />
                </MemoryRouter>
            </QueryClientProvider>
        );

        const row = await screen.findAllByText('1000904');
        fireEvent.click(row[0]);
        expect(screen.getByRole('complementary', { name: 'Membership detail' })).toBeTruthy();

        fireEvent.change(screen.getByDisplayValue('Production (v1)'), { target: { value: 'd1' } });

        await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Membership detail' })).toBeNull());
    });
});
