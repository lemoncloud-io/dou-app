import type { DownloadResult, NativeDownload } from '../../../runtime/transfer';
import { exportMedia, saveAllMedia, toastFor, toastForSaveAll, type MediaExportDeps } from './imageExport';

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
const setup = (results: Array<DownloadResult | Promise<DownloadResult>>, overrides: Partial<MediaExportDeps> = {}) => {
    const started: Array<{ url: string; cancel: jest.Mock }> = [];
    const deps: MediaExportDeps & { [K in keyof MediaExportDeps]: jest.Mock } = {
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
        withdrawVideos: jest.fn(),
        ...overrides,
    } as never;
    const acked = () => deps.acknowledge.mock.calls.map(([ids]) => ids);
    return { deps, started, acked };
};

describe('exportMedia', () => {
    it('saves the downloaded file and then acknowledges its download', async () => {
        const { deps, acked } = setup([{ kind: 'file', file: file(1) }]);

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'saved' });

        expect(deps.save).toHaveBeenCalledWith(file(1).uri);
        expect(acked()).toEqual([['d-1']]);
        expect(deps.save.mock.invocationCallOrder[0]).toBeLessThan(deps.acknowledge.mock.invocationCallOrder[0]);
    });

    it('shares with the name as the title, and tells a completed share from a dismissed one', async () => {
        const completed = setup([{ kind: 'file', file: file(1) }]);
        await expect(exportMedia({ action: 'share', url, name: 'photo.jpg' }, completed.deps)).resolves.toEqual({
            kind: 'shared',
        });
        expect(completed.deps.share).toHaveBeenCalledWith(file(1).uri, 'photo.jpg');

        const dismissed = setup([{ kind: 'file', file: file(1) }], {
            share: jest.fn(async () => ({ data: { completed: false } })),
        });
        await expect(exportMedia({ action: 'share', url }, dismissed.deps)).resolves.toEqual({ kind: 'dismissed' });
    });

    it('reads the message again once on a 403 and downloads from the fresh address', async () => {
        const { deps, started } = setup([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'file', file: file(2) },
        ]);

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'saved' });

        expect(started.map(entry => entry.url)).toEqual([url, fresh]);
        expect(deps.save).toHaveBeenCalledWith(file(2).uri);
    });

    it('fails on a second 403 without reading the message a second time', async () => {
        const { deps } = setup([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'responded', httpStatus: 403 },
        ]);

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.freshUrl).toHaveBeenCalledTimes(1);
    });

    it('fails a 403 when the message has no newer address', async () => {
        const { deps } = setup([{ kind: 'responded', httpStatus: 403 }], { freshUrl: jest.fn(async () => url) });

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.download).toHaveBeenCalledTimes(1);
    });

    it('downloads again once when the file vanished before it could be saved', async () => {
        const { deps, acked } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
            { kind: 'file', file: file(3) },
        ]);
        deps.save.mockRejectedValueOnce(failure('SOURCE')).mockRejectedValueOnce(failure('SOURCE'));

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });

        expect(deps.download).toHaveBeenCalledTimes(2);
        expect(acked()).toEqual([['d-1'], ['d-2']]);
    });

    it('withdraws export when the shell turns out not to know the message', async () => {
        const fromStart = setup([{ kind: 'unsupported' }]);
        await expect(exportMedia({ action: 'save', url }, fromStart.deps)).resolves.toEqual({
            kind: 'update-required',
        });
        expect(fromStart.deps.withdraw).toHaveBeenCalledTimes(1);

        const fromSave = setup([{ kind: 'file', file: file(1) }]);
        fromSave.deps.save.mockRejectedValueOnce(failure('NOT_FOUND'));
        await expect(exportMedia({ action: 'save', url }, fromSave.deps)).resolves.toEqual({ kind: 'update-required' });
        expect(fromSave.deps.withdraw).toHaveBeenCalledTimes(1);
    });

    it('logs the shell refusing its own file as invalid, and reports a plain failure', async () => {
        const log = jest.fn();
        const { deps } = setup([{ kind: 'file', file: file(1) }], { log });
        deps.save.mockRejectedValueOnce(failure('INVALID'));

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({ kind: 'failed' });
        expect(log).toHaveBeenCalledTimes(1);
    });

    it('carries whether the permission can still be asked for', async () => {
        const { deps } = setup([{ kind: 'file', file: file(1) }]);
        deps.save.mockRejectedValueOnce(failure('PERMISSION_DENIED', { canAskAgain: true }));

        await expect(exportMedia({ action: 'save', url }, deps)).resolves.toEqual({
            kind: 'permission',
            canAskAgain: true,
        });
    });

    it('maps the remaining failures', async () => {
        const run = async (result: DownloadResult, saveError?: Error) => {
            const { deps } = setup([result]);
            if (saveError) deps.save.mockRejectedValueOnce(saveError);
            return exportMedia({ action: 'save', url }, deps);
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

        const outcome = exportMedia({ action: 'share', url, signal: controller.signal }, deps);
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

        const outcome = exportMedia({ action: 'share', url, signal: controller.signal }, deps);
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

        const outcome = exportMedia({ action: 'save', url, signal: controller.signal }, deps);
        controller.abort();

        await expect(outcome).resolves.toEqual({ kind: 'saved' });
        expect(started[0].cancel).not.toHaveBeenCalled();
    });

    it('learns from a video refused as a format that the app is too old for videos', async () => {
        const saving = setup([{ kind: 'file', file: file(1) }]);
        saving.deps.save.mockRejectedValueOnce(failure('UNSUPPORTED_TYPE'));
        await expect(exportMedia({ action: 'save', kind: 'video', url }, saving.deps)).resolves.toEqual({
            kind: 'video-update-required',
        });
        expect(saving.deps.withdrawVideos).toHaveBeenCalledTimes(1);
        expect(saving.deps.withdraw).not.toHaveBeenCalled();

        const sharing = setup([{ kind: 'file', file: file(1) }]);
        sharing.deps.share.mockRejectedValueOnce(failure('UNSUPPORTED_TYPE'));
        await expect(exportMedia({ action: 'share', kind: 'video', url }, sharing.deps)).resolves.toEqual({
            kind: 'video-update-required',
        });
        expect(sharing.deps.withdrawVideos).toHaveBeenCalledTimes(1);
    });

    it('keeps reading a photo refused as a format as just that format', async () => {
        const { deps } = setup([{ kind: 'file', file: file(1) }]);
        deps.save.mockRejectedValueOnce(failure('UNSUPPORTED_TYPE'));

        await expect(exportMedia({ action: 'save', kind: 'image', url }, deps)).resolves.toEqual({
            kind: 'unsupported-type',
        });
        expect(deps.withdrawVideos).not.toHaveBeenCalled();
    });

    it('gives a video the same recoveries as a photo', async () => {
        const { deps, started } = setup([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'file', file: file(2) },
            { kind: 'file', file: file(3) },
        ]);
        deps.save.mockRejectedValueOnce(failure('SOURCE'));

        await expect(exportMedia({ action: 'save', kind: 'video', url }, deps)).resolves.toEqual({ kind: 'saved' });
        expect(started.map(entry => entry.url)).toEqual([url, fresh, fresh]);
        expect(deps.save).toHaveBeenLastCalledWith(file(3).uri);
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
        expect(toastFor({ kind: 'video-update-required' })?.titleKey).toBe('chat.attach.export.videoUpdateRequired');
    });

    it('words a saved or failed video as a video', () => {
        expect(toastFor({ kind: 'saved' }, 'video')?.titleKey).toBe('chat.attach.export.savedVideo');
        expect(toastFor({ kind: 'failed' }, 'video')?.titleKey).toBe('chat.attach.export.failedVideo');
        expect(toastFor({ kind: 'network' }, 'video')?.titleKey).toBe('chat.attach.export.network');
    });
});

const photo = (id: string) => ({ url: `https://bucket/${id}`, name: `${id}.jpg`, kind: 'image' as const, id });
const video = (id: string) => ({ url: `https://bucket/${id}`, name: `${id}.mp4`, kind: 'video' as const, id });
const saved = (kind: 'image' | 'video' = 'image') => ({ kind, outcome: { kind: 'saved' as const } });

describe('saveAllMedia', () => {
    const items = [photo('a'), photo('b'), photo('c')];

    it('saves one item after another, each with its own dependencies, and reports where it is', async () => {
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
        const depsFor = jest.fn((_item: (typeof items)[number]) => deps);
        const progress = jest.fn();

        const results = await saveAllMedia(items, depsFor, progress);

        expect(results).toEqual([saved(), saved(), saved()]);
        expect(started.map(entry => entry.url)).toEqual(items.map(item => item.url));
        expect(depsFor.mock.calls.map(([item]) => item.id)).toEqual(['a', 'b', 'c']);
        expect(most).toBe(1);
        expect(progress.mock.calls).toEqual([
            [{ current: 1, total: 3, fraction: 0 }],
            [{ current: 2, total: 3, fraction: 1 / 3 }],
            [{ current: 3, total: 3, fraction: 2 / 3 }],
        ]);
    });

    it('saves photos and videos in the order given, each as what it is', async () => {
        const { deps } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
        ]);

        const results = await saveAllMedia([video('v'), photo('p')], () => deps);

        expect(results).toEqual([saved('video'), saved('image')]);
        expect(deps.save.mock.calls).toEqual([[file(1).uri], [file(2).uri]]);
    });

    it('skips an item that fails and goes on', async () => {
        const { deps } = setup([
            { kind: 'failed', reason: 'network' },
            { kind: 'file', file: file(2) },
            { kind: 'stalled' },
        ]);

        const results = await saveAllMedia(items, () => deps);

        expect(results.map(result => result.outcome.kind)).toEqual(['network', 'saved', 'network']);
    });

    it('stops at a refused permission, since every other item would get the same answer', async () => {
        const { deps } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
        ]);
        deps.save.mockRejectedValueOnce(failure('PERMISSION_DENIED', { canAskAgain: false }));

        const results = await saveAllMedia(items, () => deps);

        expect(results).toEqual([{ kind: 'image', outcome: { kind: 'permission', canAskAgain: false } }]);
        expect(deps.download).toHaveBeenCalledTimes(1);
    });

    it('stops when the app turns out not to know the message', async () => {
        const { deps } = setup([{ kind: 'unsupported' }]);

        await expect(saveAllMedia(items, () => deps)).resolves.toEqual([
            { kind: 'image', outcome: { kind: 'update-required' } },
        ]);
    });

    it('skips the remaining videos once one is refused as a format, and keeps saving photos', async () => {
        const { deps, started } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
            { kind: 'file', file: file(3) },
        ]);
        deps.save.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(failure('UNSUPPORTED_TYPE'));

        const results = await saveAllMedia([photo('a'), video('v1'), video('v2'), photo('b')], () => deps);

        expect(results).toEqual([saved(), { kind: 'video', outcome: { kind: 'video-update-required' } }, saved()]);
        expect(started.map(entry => entry.url)).toEqual(['https://bucket/a', 'https://bucket/v1', 'https://bucket/b']);
        expect(deps.withdrawVideos).toHaveBeenCalledTimes(1);
    });

    it('finishes the item it is on when the viewer closes, and starts no other', async () => {
        let finish: (result: DownloadResult) => void = () => undefined;
        const pending = new Promise<DownloadResult>(resolve => (finish = resolve));
        const { deps } = setup([pending, { kind: 'file', file: file(2) }]);
        const controller = new AbortController();

        const run = saveAllMedia(items, () => deps, undefined, controller.signal);
        await Promise.resolve();
        controller.abort();
        finish({ kind: 'file', file: file(1) });

        await expect(run).resolves.toEqual([saved()]);
        expect(deps.download).toHaveBeenCalledTimes(1);
        expect(deps.save).toHaveBeenCalledWith(file(1).uri);
    });
});

describe('toastForSaveAll', () => {
    it('counts the photos saved in a run of photos', () => {
        expect(toastForSaveAll([saved(), saved()])).toEqual({
            titleKey: 'chat.attach.export.savedAll',
            values: { n: 2 },
            variant: 'default',
        });
        expect(toastForSaveAll([saved(), { kind: 'image', outcome: { kind: 'network' } }, saved()])).toEqual({
            titleKey: 'chat.attach.export.savedSome',
            values: { saved: 2, failed: 1 },
            variant: 'default',
        });
    });

    it('counts items rather than photos once a video is in the run', () => {
        expect(toastForSaveAll([saved(), saved('video')])).toEqual({
            titleKey: 'chat.attach.export.savedAllItems',
            values: { n: 2 },
            variant: 'default',
        });
        expect(toastForSaveAll([saved('video'), { kind: 'image', outcome: { kind: 'failed' } }])).toEqual({
            titleKey: 'chat.attach.export.savedSomeItems',
            values: { saved: 1, failed: 1 },
            variant: 'default',
        });
    });

    it('says how many photos were saved and that videos need an update when a video was refused', () => {
        const refused = { kind: 'video' as const, outcome: { kind: 'video-update-required' as const } };

        expect(toastForSaveAll([saved(), refused, saved()])).toEqual({
            titleKey: 'chat.attach.export.savedPhotosVideosNeedUpdate',
            values: { n: 2 },
            variant: 'default',
        });
        expect(toastForSaveAll([refused])?.titleKey).toBe('chat.attach.export.videoUpdateRequired');
    });

    it('speaks for the reason a run stopped, even after some were saved', () => {
        expect(
            toastForSaveAll([saved(), { kind: 'image', outcome: { kind: 'permission', canAskAgain: false } }])?.titleKey
        ).toBe('chat.attach.export.permission');
    });

    it('speaks for the last failure when nothing was saved, and stays quiet when nothing had a voice', () => {
        expect(
            toastForSaveAll([
                { kind: 'image', outcome: { kind: 'network' } },
                { kind: 'video', outcome: { kind: 'failed' } },
            ])?.titleKey
        ).toBe('chat.attach.export.failedVideo');
        expect(
            toastForSaveAll([
                { kind: 'image', outcome: { kind: 'timed-out' } },
                { kind: 'image', outcome: { kind: 'timed-out' } },
            ])
        ).toBeNull();
    });
});

describe('saveAllMedia progress', () => {
    it('counts the share of the current download as well as the items done', async () => {
        const { deps } = setup([
            { kind: 'file', file: file(1) },
            { kind: 'file', file: file(2) },
        ]);
        // Each download reports half its bytes before it ends.
        const halfway: MediaExportDeps = {
            ...deps,
            download: input => {
                input.onProgress?.({ transferredBytes: 5, totalBytes: 10 });
                return deps.download(input);
            },
        };
        const progress = jest.fn();

        await saveAllMedia([photo('a'), video('b')], () => halfway, progress);

        expect(progress.mock.calls.map(([entry]) => [entry.current, entry.fraction])).toEqual([
            [1, 0],
            [1, 0.25],
            [2, 0.5],
            [2, 0.75],
        ]);
    });
});
