import '@testing-library/jest-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MemoryStore } from '@chatic/storage';

import { StorageScreen } from './StorageScreen';
import { setDebugLanguageForTests } from '../../i18n';
import type { WebStorageEnv } from '../../lib/webStorage';
import type { ActiveStores, ActiveVault } from '../../../../runtime/activeStorage';

const fetchNativeStorageSummary = jest.fn();
const clearNativeCache = jest.fn();
let native = true;

jest.mock('../../../../bridge', () => ({
    appBridge: {
        fetchNativeStorageSummary: () => fetchNativeStorageSummary(),
        clearNativeCache: (include: boolean) => clearNativeCache(include),
    },
}));
jest.mock('@chatic/bridges', () => ({
    isNative: () => native,
    logger: { warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../runtime/launchSessionOwner', () => ({ readLaunchSessionOwner: () => undefined }));
const requestSyncCursorReset = jest.fn(async () => undefined);
jest.mock('@chatic/runtime', () =>
    require('@chatic/runtime/testing').fakeRuntimeModule({
        data: { requestSyncCursorReset: () => requestSyncCursorReset() },
        session: { isSessionKey: (key: string) => key === 'chatic-cloud-token-cache' },
    })
);

const memoryStorage = (entries: Record<string, string> = {}): Storage => {
    const data = new Map(Object.entries(entries));
    return {
        get length() {
            return data.size;
        },
        key: (index: number) => [...data.keys()][index] ?? null,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, value),
        removeItem: (key: string) => void data.delete(key),
        clear: () => data.clear(),
    };
};

const summary = {
    sqlite: [
        { name: 'chats', count: 12, bytes: 3400 },
        { name: 'invite_clouds', count: 2, bytes: 300 },
        { name: 'invites', count: 1, bytes: 90 },
        { name: 'profiles', count: 0, bytes: 0, missing: true as const },
    ],
    mmkv: [{ name: 'theme', count: 1, bytes: 6 }],
    unrecoverableTables: ['invite_clouds'],
    keptTables: ['invites'],
};

describe('StorageScreen', () => {
    let restoreLanguage: () => void;
    let env: WebStorageEnv;
    let navigate: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        native = true;
        fetchNativeStorageSummary.mockResolvedValue({ data: summary });
        clearNativeCache.mockResolvedValue({ data: { cleared: ['chats'], kept: ['invite_clouds'], failed: [] } });
        env = {
            localStorage: memoryStorage({
                'chatic-cloud-token-cache': '{}',
                'chatic-pinned-channels': '[]',
                '@chatic/web.log.pending.1': '[]',
            }),
            sessionStorage: memoryStorage({ 'chatic-debug-mode': 'true' }),
        };
        navigate = jest.fn();
        restoreLanguage = setDebugLanguageForTests('en');
    });

    afterEach(() => restoreLanguage());

    const clickTwice = async (name: string) => {
        await userEvent.click(screen.getByRole('button', { name }));
        await userEvent.click(screen.getByRole('button', { name: 'Tap again to confirm' }));
    };

    it('shows both halves: native tables and keys, web groups', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);

        expect(await screen.findByText('chats')).toBeInTheDocument();
        expect(screen.getByText('12 rows · 3.4 KB')).toBeInTheDocument();
        expect(screen.getByText("can't be refilled")).toBeInTheDocument();
        expect(screen.getByText('always kept')).toBeInTheDocument();
        expect(screen.getByText('missing')).toBeInTheDocument();
        expect(screen.getByText('1 row · 90 B')).toBeInTheDocument();
        expect(screen.getByText('theme')).toBeInTheDocument();
        expect(screen.getByText('Session & sign-in')).toBeInTheDocument();
        expect(screen.getByText('UI state & other')).toBeInTheDocument();
    });

    it('arms on the first tap and clears the native cache, keeping invited clouds, on the second', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await userEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
        expect(clearNativeCache).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Tap again to confirm' }));

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('reload'));
        expect(clearNativeCache).toHaveBeenCalledWith(false);
        expect(requestSyncCursorReset).toHaveBeenCalledTimes(1);
        expect(env.localStorage.length).toBe(3);
    });

    it('disarms the clear when the invited-cloud box changes after the first tap', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await userEvent.click(screen.getByRole('button', { name: 'Clear app cache' }));
        await userEvent.click(screen.getByRole('checkbox', { name: /Also delete the invited-cloud list/ }));

        expect(screen.getByRole('button', { name: 'Clear app cache' })).toBeInTheDocument();
        expect(clearNativeCache).not.toHaveBeenCalled();
    });

    it('asks the app to drop invited clouds only after the box is ticked', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await userEvent.click(screen.getByRole('checkbox', { name: /Also delete the invited-cloud list/ }));
        await clickTwice('Clear app cache');

        await waitFor(() => expect(clearNativeCache).toHaveBeenCalledWith(true));
    });

    it('stays on the page and names the tables when a native clear is partial', async () => {
        clearNativeCache.mockResolvedValue({ data: { cleared: [], kept: [], failed: ['profiles'] } });
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear app cache');

        expect(await screen.findByText(/Some tables did not clear: profiles/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('wipes the web storage and starts over at the root', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear web cache');

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('root'));
        expect(env.localStorage.length).toBe(1);
        expect(env.localStorage.key(0)).toBe('@chatic/web.log.pending.1');
        expect(env.sessionStorage.length).toBe(0);
        expect(requestSyncCursorReset).toHaveBeenCalledTimes(1);
        expect(clearNativeCache).not.toHaveBeenCalled();
    });

    it('stays on the page when the web storage refuses the wipe', async () => {
        env.localStorage.removeItem = () => {
            throw new Error('storage blocked');
        };
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear web cache');

        expect(await screen.findByText(/storage blocked/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
        expect(requestSyncCursorReset).not.toHaveBeenCalled();
    });

    it('empties the device vault before the web storages, where the shell keeps one', async () => {
        const clearVault = jest.fn(async () => true);
        env.clearVault = clearVault;
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear web cache');

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('root'));
        expect(clearVault).toHaveBeenCalledTimes(1);
    });

    it('stays signed in on the page when the vault refuses the wipe, and leaves the web storages alone', async () => {
        env.clearVault = jest.fn(async () => false);
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear web cache');

        expect(await screen.findByText(/device vault was not cleared/)).toBeInTheDocument();
        expect(navigate).not.toHaveBeenCalled();
        expect(env.localStorage.length).toBe(3);
    });

    it('clears both, native first', async () => {
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear both');

        await waitFor(() => expect(navigate).toHaveBeenCalledWith('root'));
        expect(clearNativeCache).toHaveBeenCalledWith(false);
        expect(env.localStorage.length).toBe(1);
    });

    it('leaves the web storage alone when the native half of a clear-both fails', async () => {
        clearNativeCache.mockRejectedValue(new Error('bridge down'));
        render(<StorageScreen env={env} navigate={navigate} />);
        await screen.findByText('chats');

        await clickTwice('Clear both');

        expect(await screen.findByText(/bridge down/)).toBeInTheDocument();
        expect(env.localStorage.length).toBe(3);
        expect(navigate).not.toHaveBeenCalled();
    });

    it('shows the error when the summary request fails, and offers no native clear', async () => {
        fetchNativeStorageSummary.mockRejectedValue({ code: 'NOT_FOUND', message: 'no handler' });
        render(<StorageScreen env={env} navigate={navigate} />);

        expect(await screen.findByText('no handler')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear app cache' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Clear both' })).toBeDisabled();
    });

    it('offers only the web half in a plain browser', async () => {
        native = false;
        render(<StorageScreen env={env} navigate={navigate} />);

        expect(await screen.findByText(/No app shell attached/)).toBeInTheDocument();
        expect(fetchNativeStorageSummary).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Clear app cache' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Clear web cache' })).toBeEnabled();
    });

    describe('active storage', () => {
        const vaultSet = (vaultStatus: 'available' | 'unavailable' = 'available') => {
            const vault: ActiveVault = Object.assign(new MemoryStore(), { status: vaultStatus });
            vault.set('chatic-relay-token', '{"c1":"tok"}');
            const webLocal = new MemoryStore();
            webLocal.set('ui.theme', 'dark');
            const webSession = new MemoryStore();
            webSession.set('chatic-debug-mode', 'true');
            const active: ActiveStores = { secret: vault, plain: webLocal, vault, webLocal, webSession };
            return { active, vault, webLocal, webSession };
        };

        const renderActive = (active: ActiveStores | null, sessionOwner: 'web' | 'native' = 'web') =>
            render(
                <StorageScreen
                    env={env}
                    navigate={navigate}
                    active={active}
                    choices={{ storage: 'storage.resolved' }}
                    sessionOwner={sessionOwner}
                />
            );

        it('names the adapter and the store each role uses this run', async () => {
            renderActive(vaultSet().active);

            expect(await screen.findByText('storage.resolved')).toBeInTheDocument();
            const secrets = screen.getByText('Session secrets (tokens)').parentElement!;
            expect(secrets).toHaveTextContent('Device vault');
            expect(screen.getByText('Session state').parentElement!).toHaveTextContent('localStorage');
        });

        it('lists the keys of every store in use, the vault included, and narrows them by the search and the field filter', async () => {
            const user = userEvent.setup();
            renderActive(vaultSet().active);

            expect(await screen.findByText('chatic-relay-token')).toBeInTheDocument();
            expect(screen.getByText('ui.theme')).toBeInTheDocument();
            expect(screen.getByText('chatic-debug-mode')).toBeInTheDocument();

            await user.selectOptions(screen.getByLabelText('Filter field'), 'medium');
            await user.type(screen.getByLabelText('Contains'), 'vault');

            expect(screen.getByText('chatic-relay-token')).toBeInTheDocument();
            expect(screen.queryByText('ui.theme')).not.toBeInTheDocument();

            await user.clear(screen.getByLabelText('Contains'));
            await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'dark');

            expect(screen.queryByText('chatic-relay-token')).not.toBeInTheDocument();
            expect(screen.getByText('ui.theme')).toBeInTheDocument();
        });

        it('saves an edit through the store the app holds, JSON compact', async () => {
            const user = userEvent.setup();
            const { active, vault } = vaultSet();
            renderActive(active);

            const row = (await screen.findByText('chatic-relay-token')).closest('li')!;
            await user.click(within(row).getByRole('button', { name: 'Edit' }));
            const editor = screen.getByLabelText('Value');
            expect(editor).toHaveValue('{\n  "c1": "tok"\n}');
            await user.clear(editor);
            await user.type(editor, '{{"c1": "new"}');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(vault.get('chatic-relay-token')).toBe('{"c1":"new"}');
            expect(screen.getByRole('status')).toHaveTextContent('Saved chatic-relay-token');
        });

        it('removes a key only on the second tap', async () => {
            const user = userEvent.setup();
            const { active, webLocal } = vaultSet();
            renderActive(active);

            const row = (await screen.findByText('ui.theme')).closest('li')!;
            await user.click(within(row).getByRole('button', { name: 'Delete' }));
            expect(webLocal.get('ui.theme')).toBe('dark');
            await user.click(within(row).getByRole('button', { name: 'Tap again to confirm' }));

            expect(webLocal.get('ui.theme')).toBeNull();
            expect(screen.queryByText('ui.theme')).not.toBeInTheDocument();
        });

        it('adds a key to the store picked, and refuses one without a name', async () => {
            const user = userEvent.setup();
            const { active, webSession } = vaultSet();
            renderActive(active);

            await user.click(await screen.findByRole('button', { name: '+ New key' }));
            await user.click(screen.getByRole('button', { name: 'Save' }));
            expect(screen.getByRole('status')).toHaveTextContent('A key is required');

            await user.selectOptions(screen.getByLabelText('Store'), 'sessionStorage');
            await user.type(screen.getByLabelText('Key'), 'probe');
            await user.type(screen.getByLabelText('Value'), '1');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(webSession.get('probe')).toBe('1');
        });

        it('says why the vault shows no keys when the app holds the session', async () => {
            renderActive(vaultSet().active, 'native');

            expect(await screen.findByText(/the page never opens the vault/)).toBeInTheDocument();
            expect(screen.queryByText('chatic-relay-token')).not.toBeInTheDocument();
            expect(screen.getByText('ui.theme')).toBeInTheDocument();
        });

        it('never offers a blocked vault for a new key, even with its chip selected', async () => {
            const user = userEvent.setup();
            const { active, vault, webLocal } = vaultSet();
            const vaultSet_ = jest.spyOn(vault, 'set');
            renderActive(active, 'native');

            await user.click(await screen.findByRole('button', { name: /Device vault/ }));
            await user.click(screen.getByRole('button', { name: '+ New key' }));
            expect(screen.getByLabelText('Store')).toHaveValue('localStorage');
            await user.type(screen.getByLabelText('Key'), 'probe');
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(vaultSet_).not.toHaveBeenCalled();
            expect(webLocal.get('probe')).toBe('');
        });

        it('says nothing was recorded when the entry point did not run', async () => {
            renderActive(null);

            expect(await screen.findByText(/Not recorded/)).toBeInTheDocument();
            expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
        });
    });
});
