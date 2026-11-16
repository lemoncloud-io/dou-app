import type * as LaunchSessionOwnerModule from './launchSessionOwner';
import { DEFAULT_SESSION_OWNER_KEY, SESSION_OWNER_KEY } from './sessionOwner';

const mockOpen = jest.fn();
jest.mock('./runtimeStorageFiles', () => ({ openSessionOwnerFile: () => mockOpen() }));
const mockConfig: { VITE_ENV?: string; VITE_SESSION_OWNER_DEFAULT?: string } = {};
jest.mock('react-native-config', () => ({ __esModule: true, default: mockConfig }));

beforeEach(() => {
    delete mockConfig.VITE_ENV;
    delete mockConfig.VITE_SESSION_OWNER_DEFAULT;
});

/** A fresh copy of the module, so each test starts before the owner was read. */
const load = (): typeof LaunchSessionOwnerModule.launchSessionOwner => {
    let launchSessionOwner: typeof LaunchSessionOwnerModule.launchSessionOwner = () => 'web';
    jest.isolateModules(() => {
        launchSessionOwner = (require('./launchSessionOwner') as typeof LaunchSessionOwnerModule).launchSessionOwner;
    });
    return launchSessionOwner;
};

describe('launchSessionOwner', () => {
    beforeEach(() => mockOpen.mockReset());

    it('reads the file once and keeps the answer for the process', () => {
        mockOpen.mockReturnValue({ getString: (key: string) => (key === SESSION_OWNER_KEY ? 'native' : undefined) });
        const launchSessionOwner = load();

        expect(launchSessionOwner()).toBe('native');
        expect(launchSessionOwner()).toBe('native');
        expect(mockOpen).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['DEV', 'native'],
        ['PROD', 'native'],
        [undefined, 'web'],
    ])('runs an install nobody switched, on a %p build, on %p', (stage, owner) => {
        mockConfig.VITE_ENV = stage;
        mockOpen.mockReturnValue({ getString: () => undefined });
        expect(load()()).toBe(owner);
    });

    it('keeps a recorded page choice on a dev build', () => {
        mockConfig.VITE_ENV = 'DEV';
        mockOpen.mockReturnValue({ getString: (key: string) => (key === SESSION_OWNER_KEY ? 'web' : undefined) });
        expect(load()()).toBe('web');
    });

    it("lets the page's default send a production build back to the page", () => {
        mockConfig.VITE_ENV = 'PROD';
        mockOpen.mockReturnValue({
            getString: (key: string) => (key === DEFAULT_SESSION_OWNER_KEY ? 'web' : undefined),
        });
        expect(load()()).toBe('web');
    });

    it("keeps a recorded switch choice over the page's default", () => {
        mockConfig.VITE_ENV = 'PROD';
        const entries: Record<string, string> = { [SESSION_OWNER_KEY]: 'native', [DEFAULT_SESSION_OWNER_KEY]: 'web' };
        mockOpen.mockReturnValue({ getString: (key: string) => entries[key] });
        expect(load()()).toBe('native');
    });

    it("lets the page's default send a dev build back to the page", () => {
        mockConfig.VITE_ENV = 'DEV';
        mockOpen.mockReturnValue({
            getString: (key: string) => (key === DEFAULT_SESSION_OWNER_KEY ? 'web' : undefined),
        });
        expect(load()()).toBe('web');
    });

    it("ignores a page default this build does not know and uses the build's", () => {
        mockConfig.VITE_ENV = 'DEV';
        mockOpen.mockReturnValue({
            getString: (key: string) => (key === DEFAULT_SESSION_OWNER_KEY ? 'shell' : undefined),
        });
        expect(load()()).toBe('native');
    });

    it("keeps the build's pin over the page's default", () => {
        mockConfig.VITE_ENV = 'DEV';
        mockConfig.VITE_SESSION_OWNER_DEFAULT = 'web';
        mockOpen.mockReturnValue({
            getString: (key: string) => (key === DEFAULT_SESSION_OWNER_KEY ? 'native' : undefined),
        });
        expect(load()()).toBe('web');
    });

    it("follows the build's override on a dev build", () => {
        mockConfig.VITE_ENV = 'DEV';
        mockConfig.VITE_SESSION_OWNER_DEFAULT = 'web';
        mockOpen.mockReturnValue({ getString: () => undefined });
        expect(load()()).toBe('web');
    });

    it("reads a file that cannot be opened as the page's, even on a dev build", () => {
        mockConfig.VITE_ENV = 'DEV';
        mockOpen.mockImplementation(() => {
            throw new Error('mmkv');
        });
        expect(load()()).toBe('web');
    });
});

describe('settledSessionOwner', () => {
    beforeEach(() => mockOpen.mockReset());

    const loadModule = (setting: string | undefined): typeof LaunchSessionOwnerModule => {
        mockOpen.mockReturnValue({ getString: (key: string) => (key === SESSION_OWNER_KEY ? setting : undefined) });
        let module: typeof LaunchSessionOwnerModule | undefined;
        jest.isolateModules(() => {
            module = require('./launchSessionOwner') as typeof LaunchSessionOwnerModule;
        });
        return module as typeof LaunchSessionOwnerModule;
    };

    it("is the page's on a launch the page owns, whatever was answered", () => {
        const { settledSessionOwner } = loadModule(undefined);
        expect(settledSessionOwner()).toBe('web');
    });

    it("is nothing on a launch set to the app's runtime until a hello is answered, then the answer", () => {
        const { recordAnsweredSessionOwner, settledSessionOwner } = loadModule('native');
        expect(settledSessionOwner()).toBeUndefined();

        recordAnsweredSessionOwner('web');
        expect(settledSessionOwner()).toBe('web');
        recordAnsweredSessionOwner('native');
        expect(settledSessionOwner()).toBe('native');
    });
});
