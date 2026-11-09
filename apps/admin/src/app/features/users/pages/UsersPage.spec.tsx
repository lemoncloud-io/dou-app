/**
 * `pages/UsersPage.spec.tsx`
 *
 * The user screen on each stage: which relay it lists from, and where Add User creates the account.
 * The relay is mocked; the session signs in to production, as the console always does.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listRelayUsers = vi.fn();
const registerUser = vi.fn();

vi.mock('@chatic/app-runtime', () => ({
    runtime: {
        data: { useRuntimeRepositories: () => ({ user: { listRelayUsers } }) },
        session: { useRegisterUserV2: () => ({ mutateAsync: registerUser, isPending: false }) },
    },
}));

vi.mock('@chatic/bridges', () => ({ logger: { error: vi.fn() } }));

import { UsersPage } from './UsersPage';

const DEV = 'https://dev.example.com/dou-d1';
const PROD = 'https://prod.example.com/dou-v1';

const renderPage = (path = '/users') =>
    render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={[path]}>
                <UsersPage />
            </MemoryRouter>
        </QueryClientProvider>
    );

beforeEach(() => {
    listRelayUsers.mockReset();
    listRelayUsers.mockResolvedValue({ list: [{ id: 'u1', name: 'Alice' }], meta: { total: 1, source: 'remote' } });
    registerUser.mockReset();
    registerUser.mockResolvedValue({ id: 'u2' });
    vi.stubEnv('VITE_DOU_ENDPOINT', PROD);
    vi.stubEnv('VITE_D1_RELAY_ENDPOINT', DEV);
    vi.stubEnv('VITE_V1_RELAY_ENDPOINT', PROD);
});

afterEach(() => vi.unstubAllEnvs());

describe('UsersPage', () => {
    it('opens a development build on the development relay, through an override', async () => {
        vi.stubEnv('VITE_ENV', 'DEV');
        renderPage();

        expect(await screen.findByText('Alice')).toBeTruthy();
        expect(listRelayUsers).toHaveBeenCalledWith({ page: 0, limit: 10 }, { endpoint: DEV });
        expect(screen.getByText(DEV)).toBeTruthy();
    });

    // The session's own relay takes no override, so the http client's own overrides still apply.
    it("lists production on the session's relay, with no override", async () => {
        renderPage('/users?stage=v1');

        await screen.findByText('Alice');
        expect(listRelayUsers).toHaveBeenCalledWith({ page: 0, limit: 10 }, undefined);
    });

    it('refetches from the other relay when the stage is switched', async () => {
        vi.stubEnv('VITE_ENV', 'DEV');
        renderPage();
        await screen.findByText('Alice');

        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'v1' } });

        await waitFor(() => expect(listRelayUsers).toHaveBeenLastCalledWith({ page: 0, limit: 10 }, undefined));
    });

    it('says which key is missing instead of listing the session relay', async () => {
        vi.stubEnv('VITE_D1_RELAY_ENDPOINT', '');
        renderPage('/users?stage=d1');

        expect(await screen.findByText(/VITE_D1_RELAY_ENDPOINT is not set/)).toBeTruthy();
        expect(listRelayUsers).not.toHaveBeenCalled();
        // The select is the way out of the error.
        expect(screen.getByRole('combobox')).toBeTruthy();
    });

    // Started off the build's own stage, so a page link that lost the stage would fall back to d1.
    it('keeps the stage when paging', async () => {
        vi.stubEnv('VITE_ENV', 'DEV');
        listRelayUsers.mockResolvedValue({
            list: [{ id: 'u1', name: 'Alice' }],
            meta: { total: 25, source: 'remote' },
        });
        renderPage('/users?stage=v1');
        await screen.findByText('Alice');

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        await waitFor(() => expect(listRelayUsers).toHaveBeenLastCalledWith({ page: 1, limit: 10 }, undefined));
        expect(listRelayUsers).not.toHaveBeenCalledWith(expect.anything(), { endpoint: DEV });
    });

    it('creates the account on the stage the page is on', async () => {
        renderPage('/users?stage=d1');
        await screen.findByText('Alice');

        fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
        fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Bob' } });
        fireEvent.change(screen.getByLabelText(/^Login ID/), { target: { value: 'bob@example.com' } });
        fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw-123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

        await waitFor(() => expect(registerUser).toHaveBeenCalled());
        expect(registerUser.mock.calls[0][0]).toMatchObject({
            stereo: 'user',
            name: 'Bob',
            loginId: 'bob@example.com',
            email: true,
            endpoint: DEV,
        });
    });

    it('says in the dialog which key is missing, and creates nothing', async () => {
        renderPage('/users?stage=d1');
        await screen.findByText('Alice');
        vi.stubEnv('VITE_D1_RELAY_ENDPOINT', '');

        fireEvent.click(screen.getByRole('button', { name: 'Add User' }));
        fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Bob' } });
        fireEvent.change(screen.getByLabelText(/^Login ID/), { target: { value: 'bob' } });
        fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw-123456' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create User' }));

        expect((await screen.findByRole('alert')).textContent).toMatch(/VITE_D1_RELAY_ENDPOINT is not set/);
        expect(registerUser).not.toHaveBeenCalled();
    });
});
