import { ShareIntakeBridge } from './ShareIntakeBridge';

const mockFetch = jest.fn();
const mockRelease = jest.fn();

jest.mock('react-native', () => ({
    NativeModules: {
        ShareIntake: { fetch: (id: string) => mockFetch(id), release: (id: string, d: boolean) => mockRelease(id, d) },
    },
}));

describe('ShareIntakeBridge — native module present', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockRelease.mockReset();
    });

    it('is available and relays fetch to the native module as it answers', async () => {
        const payload = { items: [], refused: [] };
        mockFetch.mockResolvedValue(payload);

        expect(ShareIntakeBridge.isAvailable).toBe(true);
        await expect(ShareIntakeBridge.fetch('id-1')).resolves.toBe(payload);
        expect(mockFetch).toHaveBeenCalledWith('id-1');
    });

    it('relays release with its discard flag', async () => {
        mockRelease.mockResolvedValue(null);

        await ShareIntakeBridge.release('id-1', true);

        expect(mockRelease).toHaveBeenCalledWith('id-1', true);
    });
});

describe('ShareIntakeBridge — native module missing', () => {
    it('is unavailable and rejects as INTERNAL, so the router can leave the messages unregistered', async () => {
        jest.resetModules();
        jest.doMock('react-native', () => ({ NativeModules: {} }));

        const { ShareIntakeBridge: withoutModule } = await import('./ShareIntakeBridge');

        expect(withoutModule.isAvailable).toBe(false);
        await expect(withoutModule.fetch('id-1')).rejects.toMatchObject({ code: 'INTERNAL' });
        await expect(withoutModule.release('id-1', true)).rejects.toMatchObject({ code: 'INTERNAL' });

        jest.dontMock('react-native');
    });
});
