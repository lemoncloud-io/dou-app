import { fetchShareIntake, releaseShareIntake } from './shareIntake';

let mockNative = true;
const mockFetch = jest.fn();
const mockRelease = jest.fn();
const mockLogger = { warn: jest.fn() };
jest.mock('@chatic/runtime-react', () => {
    const testing = require('@chatic/runtime-react/testing');
    return testing.fakeRuntimeModule({
        get links() {
            return mockNative
                ? { ...testing.browserLinks(), kind: 'shell', shareIntake: { fetch: mockFetch, release: mockRelease } }
                : testing.browserLinks();
        },
    });
});
jest.mock('@chatic/bridges', () => ({
    logger: { warn: (...args: unknown[]) => mockLogger.warn(...args), info: jest.fn(), error: jest.fn() },
}));
jest.mock('./appBridge', () => ({ appBridge: {} }));
jest.mock('./photoLibrary', () => ({ base64ToFile: jest.fn() }));

const id = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
const dir = `file:///data/user/0/io.chatic.dou/cache/attach-pick/${id}`;
const withCode = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
});

describe('fetchShareIntake', () => {
    it('asks nothing in a browser', async () => {
        mockNative = false;

        await expect(fetchShareIntake(id)).resolves.toBeNull();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('hands the items back as shell files, with the refusals and the text', async () => {
        mockFetch.mockResolvedValue({
            items: [
                { kind: 'file', uri: `${dir}/a.jpg`, name: 'a.jpg', contentType: 'image/jpeg', size: 5 },
                {
                    kind: 'video',
                    uri: `${dir}/b.mov`,
                    name: 'b.mov',
                    contentType: 'video/quicktime',
                    size: 9,
                    needsExport: true,
                },
            ],
            refused: [{ name: 'c.exe', kind: 'file', reason: 'unsupported' }],
            text: 'look at this',
        });

        const intake = await fetchShareIntake(id);

        expect(mockFetch).toHaveBeenCalledWith(id);
        expect(intake).toEqual({
            items: [
                { uri: `${dir}/a.jpg`, name: 'a.jpg', type: 'image/jpeg', size: 5, kind: 'file' },
                {
                    uri: `${dir}/b.mov`,
                    name: 'b.mov',
                    type: 'video/quicktime',
                    size: 9,
                    kind: 'video',
                    needsExport: true,
                },
            ],
            refused: [{ name: 'c.exe', kind: 'file', reason: 'unsupported' }],
            text: 'look at this',
        });
    });

    it('drops blank text', async () => {
        mockFetch.mockResolvedValue({ items: [], refused: [], text: '   ' });

        await expect(fetchShareIntake(id)).resolves.toEqual({ items: [], refused: [], text: undefined });
    });

    it.each(['GONE', 'INVALID'])('reads %s as nothing to share', async code => {
        mockFetch.mockRejectedValue(withCode(code));

        await expect(fetchShareIntake(id)).resolves.toBeNull();
    });

    it('lets a transient failure through, logged, so the page can say it could not load', async () => {
        mockFetch.mockRejectedValue(withCode('TIMEOUT'));

        await expect(fetchShareIntake(id)).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(mockLogger.warn).toHaveBeenCalledWith('file.share_intake_fetch_failed', expect.any(String), {
            code: 'TIMEOUT',
        });
    });
});

describe('releaseShareIntake', () => {
    it('tells the shell to forget the share, discarding the copies when asked', async () => {
        mockRelease.mockResolvedValue(undefined);

        await releaseShareIntake(id, { discard: true });

        expect(mockRelease).toHaveBeenCalledWith(id, { discard: true });
    });

    it('never throws: a release that fails leaves the copies to the shell sweep', async () => {
        mockRelease.mockRejectedValue(withCode('NOT_FOUND'));

        await expect(releaseShareIntake(id, { discard: false })).resolves.toBeUndefined();
        expect(mockLogger.warn).toHaveBeenCalledWith('file.share_intake_release_failed', expect.any(String), {
            code: 'NOT_FOUND',
            discard: false,
        });
    });

    it('asks nothing in a browser', async () => {
        mockNative = false;

        await releaseShareIntake(id, { discard: true });

        expect(mockRelease).not.toHaveBeenCalled();
    });
});
