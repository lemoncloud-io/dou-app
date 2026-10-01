import type { DownloadResult, NativeDownload } from '../../../runtime/transfer';
import { exportImage, saveAllImages, toastFor, toastForSaveAll, type ImageExportDeps } from './imageExport';

const file = (n: number) => ({
    uri: `file:///cache/transfer-download/h${n}/photo.jpg`,
    size: 3,
    contentType: 'image/jpeg',
});
const url = 'https://bucket.s3.amazonaws.com/k?X-Amz-Signature=old';
const fresh = 'https://bucket.s3.amazonaws.com/k?X-Amz-Signature=new';

const failure = (code: string, details?: unknown) => Object.assign(new Error(code), { code, details });

/**
 * Deps whose downloads answer from `results` in order, each with its own id. A result may be a
 * promise the test resolves later.
 */
const setup = (results: Array<DownloadResult | Promise<DownloadResult>>, overrides: Partial<ImageExportDeps> = {}) => {
    const started: Array<{ url: string; cancel: jest.Mock }> = [];
    const deps: ImageExportDeps & { [K in keyof ImageExportDeps]: jest.Mock } = {
        download: jest.fn((input: { url: string }): NativeDownload => {
            const cancel = jest.fn();
            started.push({ url: input.url, cancel });
            const n = started.length;
            return { transferId: `d-${n}`, result: Promise.resolve(results[n - 1]), cancel };
        }),
        acknowledge: jest.fn(async () => undefined),
        save: jest.fn(async () => ({ data: {} })),
        share: jest.fn(async () => ({ data: { completed: true } })),
        freshUrl: jest.fn(async () => fresh),
        withdraw: jest.fn(),
        ...overrides,
    } as never;
    const acked = () => deps.acknowledge.mock.calls.map(([ids]) => ids);
    return { deps, started, acked };
};

describe('exportImage', () => {
    it('saves the downloaded file and then acknowledges its download', async () => {
        const { deps, acked } = setup([{ kind: 'file', file: file(1) }]);

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'saved' });

        expect(deps.save).toHaveBeenCalledWith(file(1).uri);
        expect(acked()).toEqual([['d-1']]);
        expect(deps.save.mock.invocationCallOrder[0]).toBeLessThan(deps.acknowledge.mock.invocationCallOrder[0]);
    });

    it('shares with the name as the title, and tells a completed share from a dismissed one', async () => {
        const completed = setup([{ kind: 'file', file: file(1) }]);
        await expect(exportImage({ action: 'share', url, name: 'photo.jpg' }, completed.deps)).resolves.toEqual({
            kind: 'shared',
        });
        expect(completed.deps.share).toHaveBeenCalledWith(file(1).uri, 'photo.jpg');

        const dismissed = setup([{ kind: 'file', file: file(1) }], {
            share: jest.fn(async () => ({ data: { completed: false } })),
        });
        await expect(exportImage({ action: 'share', url }, dismissed.deps)).resolves.toEqual({ kind: 'dismissed' });
    });

    it('reads the message again once on a 403 and downloads from the fresh address', async () => {
        const { deps, started } = setup([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'file', file: file(2) },
        ]);

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'saved' });

        expect(started.map(entry => entry.url)).toEqual([url, fresh]);
        expect(deps.save).toHaveBeenCalledWith(file(2).uri);
    });

    it('fails on a second 403 without reading the message a second time', async () => {
        const { deps } = setup([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'responded', httpStatus: 403 },
        ]);

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.freshUrl).toHaveBeenCalledTimes(1);
    });

    it('fails a 403 when the message has no newer address', async () => {
        const { deps } = setup([{ kind: 'responded', httpStatus: 403 }], { freshUrl: jest.fn(async () => url) });

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.download).toHaveBeenCalledTimes(1);
    });

    it('downloads again once when the file vanished before it could be saved', async () => {
        const { deps, acked } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
            { kind: 'file', file: file(3) },
        ]);
        deps.save.mockRejectedValueOnce(failure('SOURCE')).mockRejectedValueOnce(failure('SOURCE'));

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });

        expect(deps.download).toHaveBeenCalledTimes(2);
        expect(acked()).toEqual([['d-1'], ['d-2']]);
    });

    it('withdraws export when the shell turns out not to know the message', async () => {
        const fromStart = setup([{ kind: 'unsupported' }]);
        await expect(exportImage({ action: 'save', url }, fromStart.deps)).resolves.toEqual({
            kind: 'update-required',
        });
        expect(fromStart.deps.withdraw).toHaveBeenCalledTimes(1);

        const fromSave = setup([{ kind: 'file', file: file(1) }]);
        fromSave.deps.save.mockRejectedValueOnce(failure('NOT_FOUND'));
        await expect(exportImage({ action: 'save', url }, fromSave.deps)).resolves.toEqual({ kind: 'update-required' });
        expect(fromSave.deps.withdraw).toHaveBeenCalledTimes(1);
    });

    it('logs the shell refusing its own file as invalid, and reports a plain failure', async () => {
        const log = jest.fn();
        const { deps } = setup([{ kind: 'file', file: file(1) }], { log });
        deps.save.mockRejectedValueOnce(failure('INVALID'));

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('carries whether the permission can still be asked for', async () => {
        const { deps } = setup([{ kind: 'file', file: file(1) }]);
        deps.save.mockRejectedValueOnce(failure('PERMISSION_DENIED', { canAskAgain: true }));

        await expect(exportImage({ action: 'save', url }, deps)).resolves.toEqual({
            kind: 'permission',
            canAskAgain: true,
        });
    });

    it('maps the remaining failures', async () => {
        const run = async (result: DownloadResult, saveError?: Error) => {
            const { deps } = setup([result]);
            if (saveError) deps.save.mockRejectedValueOnce(saveError);
            return exportImage({ action: 'save', url }, deps);
        };

        await expect(run({ kind: 'stalled' })).resolves.toEqual({ kind: 'network' });
        await expect(run({ kind: 'failed', reason: 'network' })).resolves.toEqual({ kind: 'network' });
        await expect(run({ kind: 'failed', reason: 'system' })).resolves.toEqual({ kind: 'failed' });
        await expect(run({ kind: 'responded', httpStatus: 500 })).resolves.toEqual({ kind: 'failed' });
        await expect(run({ kind: 'file', file: file(1) }, failure('UNSUPPORTED_TYPE'))).resolves.toEqual({
            kind: 'unsupported-type',
        });
        await expect(run({ kind: 'file', file: file(1) }, failure('TIMEOUT'))).resolves.toEqual({ kind: 'timed-out' });
        await expect(run({ kind: 'file', file: file(1) }, failure('INTERNAL'))).resolves.toEqual({ kind: 'failed' });
    });

    it('cancels a share’s download when the viewer closes, and never opens the sheet', async () => {
        let finish: (result: DownloadResult) => void = () => undefined;
        const pending = new Promise<DownloadResult>(resolve => (finish = resolve));
        const { deps, started } = setup([pending]);
        const controller = new AbortController();

        const outcome = exportImage({ action: 'share', url, signal: controller.signal }, deps);
        await Promise.resolve();
        controller.abort();
        expect(started[0].cancel).toHaveBeenCalledTimes(1);
        finish({ kind: 'cancelled' });

        await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
        expect(deps.share).not.toHaveBeenCalled();
    });

    it('does not open the sheet for a file that arrived after the viewer closed', async () => {
        let finish: (result: DownloadResult) => void = () => undefined;
        const pending = new Promise<DownloadResult>(resolve => (finish = resolve));
        const { deps, acked } = setup([pending]);
        const controller = new AbortController();

        const outcome = exportImage({ action: 'share', url, signal: controller.signal }, deps);
        await Promise.resolve();
        // The file was already on its way when the cancel went out.
        controller.abort();
        finish({ kind: 'file', file: file(1) });

        await expect(outcome).resolves.toEqual({ kind: 'cancelled' });
        expect(deps.share).not.toHaveBeenCalled();
        expect(acked()).toEqual([['d-1']]);
    });

    it('keeps saving after the viewer closes', async () => {
        const { deps, started } = setup([{ kind: 'file', file: file(1) }]);
        const controller = new AbortController();

        const outcome = exportImage({ action: 'save', url, signal: controller.signal }, deps);
        controller.abort();

        await expect(outcome).resolves.toEqual({ kind: 'saved' });
        expect(started[0].cancel).not.toHaveBeenCalled();
    });
});

describe('toastFor', () => {
    it('stays quiet for a share, a dismissal, a cancel and a timeout', () => {
        expect(toastFor({ kind: 'shared' })).toBeNull();
        expect(toastFor({ kind: 'dismissed' })).toBeNull();
        expect(toastFor({ kind: 'cancelled' })).toBeNull();
        expect(toastFor({ kind: 'timed-out' })).toBeNull();
    });

    it('offers the settings only for a refused permission', () => {
        expect(toastFor({ kind: 'permission', canAskAgain: false })).toEqual({
            titleKey: 'chat.attach.export.permission',
            variant: 'destructive',
            settings: true,
        });
        expect(toastFor({ kind: 'saved' })).toEqual({ titleKey: 'chat.attach.export.saved', variant: 'default' });
        expect(toastFor({ kind: 'network' })?.settings).toBeUndefined();
    });

    it('has a key for every outcome that speaks', () => {
        expect(toastFor({ kind: 'unsupported-type' })?.titleKey).toBe('chat.attach.export.unsupportedType');
        expect(toastFor({ kind: 'network' })?.titleKey).toBe('chat.attach.export.network');
        expect(toastFor({ kind: 'failed' })?.titleKey).toBe('chat.attach.export.failed');
        expect(toastFor({ kind: 'update-required' })?.titleKey).toBe('chat.attach.export.updateRequired');
    });
});

describe('saveAllImages', () => {
    const items = [
        { url: 'https://bucket/a', name: 'a.jpg', id: 'a' },
        { url: 'https://bucket/b', name: 'b.jpg', id: 'b' },
        { url: 'https://bucket/c', name: 'c.jpg', id: 'c' },
    ];

    it('saves one image after another, each with its own dependencies, and reports progress', async () => {
        const { deps, started } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
            { kind: 'file', file: file(3) },
        ]);
        let inFlight = 0;
        let most = 0;
        deps.save.mockImplementation(async () => {
            inFlight += 1;
            most = Math.max(most, inFlight);
            await Promise.resolve();
            inFlight -= 1;
            return { data: {} };
        });
        const depsFor = jest.fn(() => deps);
        const progress = jest.fn();

        const outcomes = await saveAllImages(items, depsFor, progress);

        expect(outcomes).toEqual([{ kind: 'saved' }, { kind: 'saved' }, { kind: 'saved' }]);
        expect(started.map(entry => entry.url)).toEqual(items.map(item => item.url));
        expect(depsFor.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'c']);
        expect(most).toBe(1);
        expect(progress.mock.calls).toEqual([[1 / 3], [2 / 3], [1]]);
    });

    it('skips an image that fails and goes on', async () => {
        const { deps } = setup([
            { kind: 'failed', reason: 'network' },
            { kind: 'file', file: file(2) },
            { kind: 'stalled' },
        ]);

        const outcomes = await saveAllImages(items, () => deps);

        expect(outcomes.map(outcome => outcome.kind)).toEqual(['network', 'saved', 'network']);
    });

    it('stops at a refused permission, since every other image would get the same answer', async () => {
        const { deps } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
        ]);
        deps.save.mockRejectedValueOnce(failure('PERMISSION_DENIED', { canAskAgain: false }));

        const outcomes = await saveAllImages(items, () => deps);

        expect(outcomes).toEqual([{ kind: 'permission', canAskAgain: false }]);
        expect(deps.download).toHaveBeenCalledTimes(1);
    });

    it('stops when the app turns out not to know the message', async () => {
        const { deps } = setup([{ kind: 'unsupported' }]);

        await expect(saveAllImages(items, () => deps)).resolves.toEqual([{ kind: 'update-required' }]);
    });
});

describe('toastForSaveAll', () => {
    it('counts what was saved', () => {
        expect(toastForSaveAll([{ kind: 'saved' }, { kind: 'saved' }], 2)).toEqual({
            titleKey: 'chat.attach.export.savedAll',
            values: { n: 2 },
            variant: 'default',
        });
        expect(toastForSaveAll([{ kind: 'saved' }, { kind: 'network' }, { kind: 'saved' }], 3)).toEqual({
            titleKey: 'chat.attach.export.savedSome',
            values: { saved: 2, total: 3 },
            variant: 'default',
        });
    });

    it('speaks for the reason a run stopped, even after some were saved', () => {
        expect(toastForSaveAll([{ kind: 'saved' }, { kind: 'permission', canAskAgain: false }], 3)?.titleKey).toBe(
            'chat.attach.export.permission'
        );
    });

    it('speaks for the last failure when nothing was saved, and stays quiet when nothing had a voice', () => {
        expect(toastForSaveAll([{ kind: 'network' }, { kind: 'failed' }], 2)?.titleKey).toBe(
            'chat.attach.export.failed'
        );
        expect(toastForSaveAll([{ kind: 'timed-out' }, { kind: 'timed-out' }], 2)).toBeNull();
    });
});

describe('saveAllImages progress', () => {
    it('counts the share of the current download as well as the images done', async () => {
        const { deps } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
        ]);
        // Each download reports half its bytes before it ends.
        const halfway: ImageExportDeps = {
            ...deps,
            download: input => {
                input.onProgress?.({ transferredBytes: 5, totalBytes: 10 });
                return deps.download(input);
            },
        };
        const progress = jest.fn();

        await saveAllImages([{ url: 'https://bucket/a' }, { url: 'https://bucket/b' }], () => halfway, progress);

        expect(progress.mock.calls).toEqual([[0.25], [0.5], [0.75], [1]]);
    });
});
