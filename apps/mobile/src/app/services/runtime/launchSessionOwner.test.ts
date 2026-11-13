import type * as LaunchSessionOwnerModule from './launchSessionOwner';
import { SESSION_OWNER_KEY } from './sessionOwner';

const mockOpen = jest.fn();
jest.mock('./runtimeStorageFiles', () => ({ openSessionOwnerFile: () => mockOpen() }));

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

    it("reads a file that cannot be opened as the page's", () => {
        mockOpen.mockImplementation(() => {
            throw new Error('mmkv');
        });
        expect(load()()).toBe('web');
    });
});
