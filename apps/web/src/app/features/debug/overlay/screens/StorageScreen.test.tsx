import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageScreen } from './StorageScreen';
import { resetUnsupportedCommands } from '../../hooks';
import { setDebugLanguageForTests } from '../../i18n';
import type { WebStorageEnv } from '../../lib/webStorage';

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
const requestSyncCursorReset = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { requestSyncCursorReset: () => requestSyncCursorReset() } },
}));

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
        resetUnsupportedCommands();
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
        // A native clear leaves the session in the WebView alone.
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
        // Everything but the unsent logs.
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

    it('says the app build is too old when it does not know the summary request', async () => {
        fetchNativeStorageSummary.mockRejectedValue({ code: 'NOT_FOUND', message: 'no handler' });
        render(<StorageScreen env={env} navigate={navigate} />);

        expect(await screen.findByText(/This app build can't report its storage/)).toBeInTheDocument();
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
});
