import { exportMediaInBrowser, mediaFileName, type BrowserMediaDeps } from './browserMediaExport';

const photo = new Blob(['jpeg'], { type: 'image/jpeg' });

const depsWith = (overrides: Partial<BrowserMediaDeps> = {}) => {
    const deps = {
        fetch: jest.fn<ReturnType<BrowserMediaDeps['fetch']>, Parameters<BrowserMediaDeps['fetch']>>(async () => ({
            kind: 'blob' as const,
            blob: photo,
        })),
        freshUrl: jest.fn(async () => 'https://bucket/fresh'),
        save: jest.fn(),
        share: jest.fn<ReturnType<BrowserMediaDeps['share']>, Parameters<BrowserMediaDeps['share']>>(
            async () => 'shared'
        ),
        ...overrides,
    };
    return deps;
};

const input = { url: 'https://bucket/old', name: 'photo.jpg', uploadId: 'u-1', kind: 'image' as const };

describe('mediaFileName', () => {
    it('keeps the name the upload was sent with', () => {
        expect(mediaFileName('beach.png', 'u-1', 'image', 'image/jpeg')).toBe('beach.png');
    });

    it('names an upload older than names by its id and the extension its type gives', () => {
        expect(mediaFileName(undefined, 'u-1', 'image', 'image/png')).toBe('u-1.png');
        expect(mediaFileName(undefined, 'v-1', 'video', 'application/octet-stream')).toBe('v-1.mp4');
        expect(mediaFileName(undefined, 'u-2', 'image', '')).toBe('u-2.jpg');
    });
});

describe('exportMediaInBrowser', () => {
    it('saves the fetched original under its name', async () => {
        const deps = depsWith();

        await expect(exportMediaInBrowser({ ...input, action: 'save' }, deps)).resolves.toEqual({ kind: 'saved' });
        expect(deps.fetch).toHaveBeenCalledWith('https://bucket/old', expect.anything());
        expect(deps.save).toHaveBeenCalledWith(photo, 'photo.jpg');
    });

    it('reads the message again once for an expired address', async () => {
        const deps = depsWith();
        jest.mocked(deps.fetch).mockResolvedValueOnce({ kind: 'expired' });

        await expect(exportMediaInBrowser({ ...input, action: 'save' }, deps)).resolves.toEqual({ kind: 'saved' });
        expect(deps.fetch).toHaveBeenLastCalledWith('https://bucket/fresh', expect.anything());
    });

    it('fails when the re-read brings no newer address, or the fetch fails', async () => {
        const unchanged = depsWith({ freshUrl: jest.fn(async () => 'https://bucket/old') });
        jest.mocked(unchanged.fetch).mockResolvedValueOnce({ kind: 'expired' });
        await expect(exportMediaInBrowser({ ...input, action: 'save' }, unchanged)).resolves.toEqual({
            kind: 'failed',
        });

        const offline = depsWith();
        jest.mocked(offline.fetch).mockResolvedValueOnce({ kind: 'failed' });
        await expect(exportMediaInBrowser({ ...input, action: 'share' }, offline)).resolves.toEqual({ kind: 'failed' });
        expect(offline.share).not.toHaveBeenCalled();
    });

    it('hands back the bytes when the browser wants a fresh tap', async () => {
        const deps = depsWith({ share: jest.fn(async () => 'needs-gesture' as const) });

        await expect(exportMediaInBrowser({ ...input, action: 'share' }, deps)).resolves.toEqual({
            kind: 'needs-gesture',
            held: photo,
        });
    });

    it('shares held bytes without fetching again', async () => {
        const deps = depsWith();

        await expect(exportMediaInBrowser({ ...input, action: 'share', held: photo }, deps)).resolves.toEqual({
            kind: 'shared',
        });
        expect(deps.fetch).not.toHaveBeenCalled();
        expect(deps.share).toHaveBeenCalledWith(photo, 'photo.jpg');
    });

    it('stops without saving once cancelled', async () => {
        const controller = new AbortController();
        const deps = depsWith({
            fetch: jest.fn(async () => {
                controller.abort();
                return { kind: 'blob' as const, blob: photo };
            }),
        });

        await expect(
            exportMediaInBrowser({ ...input, action: 'share', signal: controller.signal }, deps)
        ).resolves.toEqual({ kind: 'cancelled' });
        expect(deps.share).not.toHaveBeenCalled();
    });
});
