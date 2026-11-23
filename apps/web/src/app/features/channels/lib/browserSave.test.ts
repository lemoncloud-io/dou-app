import { saveFileInBrowser, type BrowserSaveDeps } from './browserSave';

const blob = new Blob(['%PDF'], { type: 'application/pdf' });

const depsWith = (overrides: Partial<BrowserSaveDeps> = {}) => {
    const deps = {
        appleTouch: jest.fn(() => false),
        canShareFiles: jest.fn(() => true),
        share: jest.fn<ReturnType<BrowserSaveDeps['share']>, Parameters<BrowserSaveDeps['share']>>(
            async () => 'shared'
        ),
        download: jest.fn(),
        ...overrides,
    };
    return deps;
};

describe('saveFileInBrowser', () => {
    it('downloads under the name everywhere but iOS', async () => {
        const deps = depsWith();

        await expect(saveFileInBrowser(blob, '회의록.pdf', deps)).resolves.toBe('saved');
        expect(deps.download).toHaveBeenCalledWith(blob, '회의록.pdf');
        expect(deps.share).not.toHaveBeenCalled();
    });

    it('puts the file on the share sheet on iOS, never on an anchor', async () => {
        const deps = depsWith({ appleTouch: () => true });

        await expect(saveFileInBrowser(blob, '회의록.pdf', deps)).resolves.toBe('saved');
        expect(deps.share).toHaveBeenCalledWith(blob, '회의록.pdf');
        expect(deps.download).not.toHaveBeenCalled();
    });

    it('passes on what the sheet said: closed, a stale press, or a refusal', async () => {
        for (const answer of ['dismissed', 'needs-gesture', 'failed'] as const) {
            const deps = depsWith({ appleTouch: () => true, share: jest.fn(async () => answer) });
            await expect(saveFileInBrowser(blob, 'a.pdf', deps)).resolves.toBe(answer);
            expect(deps.download).not.toHaveBeenCalled();
        }
    });

    it('falls back to the download on an iOS too old to share files', async () => {
        const deps = depsWith({ appleTouch: () => true, canShareFiles: () => false });

        await expect(saveFileInBrowser(blob, 'a.pdf', deps)).resolves.toBe('saved');
        expect(deps.download).toHaveBeenCalled();
    });
});
