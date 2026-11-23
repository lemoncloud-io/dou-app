import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { runtime } from '@chatic/runtime';

import { DBBrowser } from './DBBrowser';
import { setDebugLanguageForTests } from '../../i18n';

jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: { useRuntimeRepositories: () => ({}), getCloudRepositories: jest.fn() },
    })
);
jest.mock('../../../../runtime/launchSessionOwner', () => ({ readLaunchSessionOwner: () => undefined }));

type PageRepositories = runtime.data.PageRepositories;

const repo = (list: Record<string, unknown>[] = []) => {
    const rows = [...list];
    return {
        rows,
        cacheReadList: jest.fn(async (_query?: unknown): Promise<{ list: Record<string, unknown>[] }> => ({ list: [...rows] })),
        cacheWrite: jest.fn(async (row: { id: string }) => {
            const at = rows.findIndex(r => r.id === row.id);
            if (at >= 0) rows[at] = { ...rows[at], ...row };
            else rows.push(row);
        }),
        cacheDelete: jest.fn(async (id: string) => {
            const at = rows.findIndex(r => r.id === id);
            if (at >= 0) rows.splice(at, 1);
        }),
        cacheClear: jest.fn(async () => void rows.splice(0)),
    };
};

const makeGraph = () => {
    const repos = {
        channel: repo([
            { id: 'ch1', name: 'General', sid: 's1' },
            { id: 'ch2', name: 'Random', sid: 's2' },
        ]),
        chat: repo(),
        user: repo(),
        join: repo(),
        place: repo(),
        cloud: repo([{ id: 'cloud-b', name: 'B' }]),
        profile: repo(),
        invite: repo(),
    };
    return { repos, graph: repos as unknown as PageRepositories };
};

const routes = [
    { type: 'channel', route: 'native' },
    { type: 'invitecloud', route: 'session' },
];

describe('DBBrowser', () => {
    let restoreLanguage: () => void;
    beforeEach(() => {
        restoreLanguage = setDebugLanguageForTests('en');
    });
    afterEach(() => restoreLanguage());

    const renderBrowser = (props: Partial<Parameters<typeof DBBrowser>[0]> = {}) => {
        const g = makeGraph();
        render(
            <DBBrowser
                repos={g.graph}
                routes={routes}
                choices={{ cache: 'cache.web-local', engine: 'engine.page' }}
                sessionOwner="web"
                scope={{ cloud: null, uid: 'u-1' }}
                {...props}
            />
        );
        return g;
    };

    it('names the cache adapter and where each domain is stored, as the assembly routed it', async () => {
        renderBrowser();

        expect(screen.getByText('cache.web-local')).toBeInTheDocument();
        expect(screen.getByText('relay · u-1')).toBeInTheDocument();
        expect(screen.getByText('SQLite (app) · channel')).toBeInTheDocument();
        expect(screen.getByText('sessionStorage (tab) · invitecloud')).toBeInTheDocument();
        expect(screen.getByText('not assembled yet · chat')).toBeInTheDocument();
        await screen.findByText('ch1');
    });

    it("says the app's runtime holds the cache when the app owns the session", async () => {
        renderBrowser({ routes: null, sessionOwner: 'native' });

        expect(screen.getByText(/the page built no cache of its own/)).toBeInTheDocument();
        expect(screen.getByText("the app's runtime · chat")).toBeInTheDocument();
        await screen.findByText('ch1');
    });

    it('lists the rows and narrows them by a field filter', async () => {
        const user = userEvent.setup();
        renderBrowser();

        expect(await screen.findByText('ch1')).toBeInTheDocument();
        expect(screen.getByText('ch2')).toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText('Filter field'), 'sid');
        await user.type(screen.getByLabelText('Contains'), 's2');

        expect(screen.queryByText('ch1')).not.toBeInTheDocument();
        expect(screen.getByText('ch2')).toBeInTheDocument();
    });

    it('sorts the rows by the field picked, both ways', async () => {
        const user = userEvent.setup();
        renderBrowser();
        await screen.findByText('ch1');
        const order = () => screen.getAllByRole('listitem').map(item => item.querySelector('.font-mono')?.textContent);

        await user.selectOptions(screen.getByLabelText('Sort by'), 'name');
        expect(order()).toEqual(['ch1', 'ch2']);
        await user.click(screen.getByRole('button', { name: 'Ascending' }));
        expect(order()).toEqual(['ch2', 'ch1']);
    });

    it('saves an edited row through the repository and reads the domain again', async () => {
        const user = userEvent.setup();
        const { repos } = renderBrowser();

        const row = (await screen.findByText('ch1')).closest('li')!;
        await user.click(within(row).getByRole('button', { name: 'Edit' }));
        const editor = screen.getByLabelText('Row (JSON)');
        await user.clear(editor);
        await user.type(editor, '{{"id":"ch1","name":"Renamed"}');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => expect(repos.channel.cacheWrite).toHaveBeenCalledWith({ id: 'ch1', name: 'Renamed' }));
        expect(await screen.findByText(/name: Renamed/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Row (JSON)')).not.toBeInTheDocument();
    });

    it('refuses a row without an id and keeps the editor open', async () => {
        const user = userEvent.setup();
        const { repos } = renderBrowser();

        await user.click(await screen.findByRole('button', { name: '+ New row' }));
        const editor = screen.getByLabelText('Row (JSON)');
        await user.clear(editor);
        await user.type(editor, '{{"name":"x"}');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(screen.getByRole('status')).toHaveTextContent('non-empty string "id"');
        expect(repos.channel.cacheWrite).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Row (JSON)')).toBeInTheDocument();
    });

    it('deletes a row and clears a domain only on the second tap', async () => {
        const user = userEvent.setup();
        const { repos } = renderBrowser();

        const row = (await screen.findByText('ch1')).closest('li')!;
        await user.click(within(row).getByRole('button', { name: 'Delete' }));
        expect(repos.channel.cacheDelete).not.toHaveBeenCalled();
        await user.click(within(row).getByRole('button', { name: 'Tap again to confirm' }));
        await waitFor(() => expect(screen.queryByText('ch1')).not.toBeInTheDocument());
        expect(repos.channel.cacheDelete).toHaveBeenCalledWith('ch1');

        await user.click(screen.getByRole('button', { name: 'Clear this domain' }));
        expect(repos.channel.cacheClear).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Tap again to confirm' }));
        expect(await screen.findByText('No rows')).toBeInTheDocument();
    });

    it('drops the old domain\'s rows, editor and field filter when another domain is picked', async () => {
        const user = userEvent.setup();
        const { repos } = renderBrowser();
        // Every channel's read waits for the gate, so the message read is still out when the screen is checked.
        let openGate: () => void = () => undefined;
        const gate = new Promise<void>(resolve => (openGate = resolve));
        repos.chat.cacheReadList.mockImplementation(async (query?: unknown) => {
            await gate;
            const channelId = (query as { channelId: string }).channelId;
            return { list: channelId === 'ch1' ? [{ id: 'm1', channelId }] : [] };
        });

        const row = (await screen.findByText('ch1')).closest('li')!;
        await user.selectOptions(screen.getByLabelText('Filter field'), 'sid');
        await user.type(screen.getByLabelText('Contains'), 's1');
        await user.click(within(row).getByRole('button', { name: 'Edit' }));
        await user.click(screen.getByRole('button', { name: 'Messages' }));

        // The channel rows are gone while the message read is still out, and so is their editor.
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
        expect(screen.queryByLabelText('Row (JSON)')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Filter field')).toHaveValue('');

        openGate();
        expect(await screen.findByText('m1')).toBeInTheDocument();
        expect(repos.channel.cacheWrite).not.toHaveBeenCalled();
    });

    it('reads messages channel by channel when the domain is picked', async () => {
        const user = userEvent.setup();
        const { repos } = renderBrowser();
        repos.chat.cacheReadList.mockImplementation(async (query: unknown) => ({
            list: [{ id: `m-${(query as { channelId: string }).channelId}`, channelId: (query as { channelId: string }).channelId }],
        }));

        await user.click(await screen.findByRole('button', { name: 'Messages' }));

        expect(await screen.findByText('m-ch1')).toBeInTheDocument();
        expect(screen.getByText('m-ch2')).toBeInTheDocument();
        expect(repos.chat.cacheReadList).toHaveBeenCalledWith({ channelId: 'ch1', limit: 50 });
    });

    it("browses another cloud through that cloud's repositories", async () => {
        const user = userEvent.setup();
        const other = makeGraph();
        other.repos.channel.rows.splice(0, 2, { id: 'b-ch', name: 'Other' });
        const cloudRepos = jest.fn(() => other.graph);
        renderBrowser({ cloudRepos });

        await screen.findByText('ch1');
        await user.selectOptions(await screen.findByLabelText('Cloud'), 'cloud-b');

        expect(await screen.findByText('b-ch')).toBeInTheDocument();
        expect(cloudRepos).toHaveBeenCalledWith('cloud-b');
    });
});
