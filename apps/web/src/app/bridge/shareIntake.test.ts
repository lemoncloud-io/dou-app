import { fetchShareIntake, releaseShareIntake } from './shareIntake';

let mockNative = true;
const mockRequest = jest.fn();
const mockLogger = { warn: jest.fn() };
jest.mock('@chatic/bridges', () => ({
    isNative: () => mockNative,
    webClient: { request: (...args: unknown[]) => mockRequest(...args) },
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
        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('hands the items back as shell files, with the refusals and the text, waiting for a slow copy', async () => {
        mockRequest.mockResolvedValue({
            data: {
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
            },
        });

        const intake = await fetchShareIntake(id);

        expect(mockRequest).toHaveBeenCalledWith(
            { type: 'FetchShareIntake', data: { id } },
            { timeoutMs: 10 * 60_000 }
        );
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
        mockRequest.mockResolvedValue({ data: { items: [], refused: [], text: '   ' } });

        await expect(fetchShareIntake(id)).resolves.toEqual({ items: [], refused: [], text: undefined });
    });

    it.each(['NOT_FOUND', 'GONE', 'INVALID'])('reads %s as nothing to share', async code => {
        mockRequest.mockRejectedValue(withCode(code));

        await expect(fetchShareIntake(id)).resolves.toBeNull();
    });

    it('lets a transient failure through, logged, so the page can say it could not load', async () => {
        mockRequest.mockRejectedValue(withCode('TIMEOUT'));

        await expect(fetchShareIntake(id)).rejects.toMatchObject({ code: 'TIMEOUT' });
        expect(mockLogger.warn).toHaveBeenCalledWith('file.share_intake_fetch_failed', expect.any(String), {
            code: 'TIMEOUT',
        });
    });
});

describe('releaseShareIntake', () => {
    it('tells the shell to forget the share, discarding the copies when asked', async () => {
        mockRequest.mockResolvedValue({ data: {} });

        await releaseShareIntake(id, { discard: true });

        expect(mockRequest).toHaveBeenCalledWith({ type: 'ReleaseShareIntake', data: { id, discard: true } });
    });

    it('never throws: a release that fails leaves the copies to the shell sweep', async () => {
        mockRequest.mockRejectedValue(withCode('NOT_FOUND'));

        await expect(releaseShareIntake(id, { discard: false })).resolves.toBeUndefined();
    });

    it('asks nothing in a browser', async () => {
        mockNative = false;

        await releaseShareIntake(id, { discard: true });

        expect(mockRequest).not.toHaveBeenCalled();
    });
});
