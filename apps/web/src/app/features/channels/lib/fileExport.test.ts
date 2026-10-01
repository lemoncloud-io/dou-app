import type { DownloadResult } from '../../../runtime/transfer';
import { exportFile, type FileExportDeps, type FileUse } from './fileExport';

const file = { uri: 'file:///cache/transfer-download/d-1/report.pdf', size: 3, contentType: 'application/pdf' };
const failure = (code: string) => Object.assign(new Error(code), { code });

/** Deps whose downloads answer from `results`, one per start, with a kept-file store of their own. */
const makeDeps = (results: DownloadResult[], overrides: Partial<FileExportDeps> = {}) => {
    let store: string | undefined;
    let n = 0;
    const cancel = jest.fn();
    const deps = {
        download: jest.fn(() => {
            n += 1;
            return {
                transferId: `d-${n}`,
                result: Promise.resolve(results.shift() ?? { kind: 'failed', reason: 'other' }),
                cancel,
            };
        }),
        acknowledge: jest.fn(async () => undefined),
        open: jest.fn(async () => ({ data: {} })),
        save: jest.fn(async () => ({ data: { saved: true as const, location: 'Download/DoU/report.pdf' } })),
        share: jest.fn(async () => ({ data: { completed: true } })),
        freshUrl: jest.fn(async () => 'https://bucket/fresh'),
        kept: jest.fn(() => store),
        keep: jest.fn((uri: string) => {
            store = uri;
        }),
        forget: jest.fn(() => {
            store = undefined;
        }),
        log: jest.fn(),
        ...overrides,
    } satisfies FileExportDeps;
    return { deps, cancel, setKept: (uri: string | undefined) => (store = uri) };
};

const input = (use: FileUse) => ({ use, url: 'https://bucket/old', name: 'report.pdf' });
const fileResult: DownloadResult = { kind: 'file', file };

describe('exportFile', () => {
    it('downloads, saves under the upload name, keeps the file and acknowledges the download', async () => {
        const { deps } = makeDeps([fileResult]);

        await expect(exportFile(input('save'), deps)).resolves.toEqual({
            kind: 'saved',
            location: 'Download/DoU/report.pdf',
        });

        expect(deps.download).toHaveBeenCalledWith(
            expect.objectContaining({ url: 'https://bucket/old', name: 'report.pdf' })
        );
        expect(deps.save).toHaveBeenCalledWith(file.uri, 'report.pdf');
        expect(deps.keep).toHaveBeenCalledWith(file.uri);
        expect(deps.acknowledge).toHaveBeenCalledWith(['d-1']);
    });

    it('reports a dismissed iOS export sheet as not saved, not as a failure', async () => {
        const { deps } = makeDeps([fileResult], { save: jest.fn(async () => ({ data: { saved: false as const } })) });

        await expect(exportFile(input('save'), deps)).resolves.toEqual({ kind: 'save-dismissed' });
        expect(deps.keep).toHaveBeenCalledWith(file.uri);
    });

    it('reuses the kept file without downloading again', async () => {
        const { deps, setKept } = makeDeps([]);
        setKept(file.uri);

        await expect(exportFile(input('open'), deps)).resolves.toEqual({ kind: 'opened' });

        expect(deps.download).not.toHaveBeenCalled();
        expect(deps.open).toHaveBeenCalledWith(file.uri);
        expect(deps.acknowledge).not.toHaveBeenCalled();
    });

    it('opens on the share sheet when nothing on the device opens the format', async () => {
        const { deps } = makeDeps([fileResult], { open: jest.fn(async () => Promise.reject(failure('NO_HANDLER'))) });

        await expect(exportFile(input('open'), deps)).resolves.toEqual({ kind: 'shared' });
        expect(deps.share).toHaveBeenCalledWith(file.uri, 'report.pdf');
    });

    it('shares the file', async () => {
        const { deps } = makeDeps([fileResult]);

        await expect(exportFile(input('share'), deps)).resolves.toEqual({ kind: 'shared' });
        expect(deps.share).toHaveBeenCalledWith(file.uri, 'report.pdf');
    });

    it('reads the message again once on a 403 and downloads from the fresh address', async () => {
        const { deps } = makeDeps([{ kind: 'responded', httpStatus: 403 }, fileResult]);

        await expect(exportFile(input('save'), deps)).resolves.toEqual(expect.objectContaining({ kind: 'saved' }));

        expect(deps.freshUrl).toHaveBeenCalledTimes(1);
        expect(deps.download).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://bucket/fresh' }));
    });

    it('fails on a second 403, and when the re-read brings no new address', async () => {
        const twice = makeDeps([
            { kind: 'responded', httpStatus: 403 },
            { kind: 'responded', httpStatus: 403 },
        ]);
        await expect(exportFile(input('save'), twice.deps)).resolves.toEqual({ kind: 'failed' });
        expect(twice.deps.download).toHaveBeenCalledTimes(2);

        const same = makeDeps([{ kind: 'responded', httpStatus: 403 }], {
            freshUrl: jest.fn(async () => 'https://bucket/old'),
        });
        await expect(exportFile(input('save'), same.deps)).resolves.toEqual({ kind: 'failed' });
        expect(same.deps.download).toHaveBeenCalledTimes(1);
    });

    it.each<FileUse>(['open', 'save', 'share'])(
        'forgets a kept file the OS cleared (SOURCE from %s) and downloads once more',
        async use => {
            const call = jest
                .fn()
                .mockRejectedValueOnce(failure('SOURCE'))
                .mockResolvedValue({ data: { saved: true, location: 'x' } });
            const { deps, setKept } = makeDeps([fileResult], { [use]: call });
            setKept('file:///cache/gone.pdf');

            const outcome = await exportFile(input(use), deps);

            expect(outcome.kind).not.toBe('failed');
            expect(deps.forget).toHaveBeenCalledTimes(1);
            expect(deps.download).toHaveBeenCalledTimes(1);
            expect(call).toHaveBeenLastCalledWith(file.uri, ...(use === 'open' ? [] : ['report.pdf']));
        }
    );

    it('gives up after a second SOURCE and forgets the file again', async () => {
        const { deps } = makeDeps([fileResult, fileResult], {
            open: jest.fn(async () => Promise.reject(failure('SOURCE'))),
        });

        await expect(exportFile(input('open'), deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.download).toHaveBeenCalledTimes(2);
        expect(deps.forget).toHaveBeenCalledTimes(2);
        expect(deps.acknowledge).toHaveBeenCalledWith(['d-1']);
        expect(deps.acknowledge).toHaveBeenCalledWith(['d-2']);
    });

    it('reads NOT_FOUND from SaveFile or OpenFile as an app that needs updating', async () => {
        const save = makeDeps([fileResult], { save: jest.fn(async () => Promise.reject(failure('NOT_FOUND'))) });
        await expect(exportFile(input('save'), save.deps)).resolves.toEqual({ kind: 'update-required' });

        const open = makeDeps([fileResult], { open: jest.fn(async () => Promise.reject(failure('NOT_FOUND'))) });
        await expect(exportFile(input('open'), open.deps)).resolves.toEqual({ kind: 'update-required' });
    });

    it('reads a shell without downloads as an app that needs updating', async () => {
        const { deps } = makeDeps([{ kind: 'unsupported' }]);
        await expect(exportFile(input('save'), deps)).resolves.toEqual({ kind: 'update-required' });
    });

    it('does not read NOT_FOUND from ShareFile as an old app — the handshake listed it', async () => {
        const { deps } = makeDeps([fileResult], { share: jest.fn(async () => Promise.reject(failure('NOT_FOUND'))) });
        await expect(exportFile(input('share'), deps)).resolves.toEqual({ kind: 'failed' });
    });

    it('reads UNSUPPORTED_TYPE from ShareFile as an app built before documents', async () => {
        const { deps } = makeDeps([fileResult], {
            share: jest.fn(async () => Promise.reject(failure('UNSUPPORTED_TYPE'))),
        });
        await expect(exportFile(input('share'), deps)).resolves.toEqual({ kind: 'share-update-required' });
    });

    it('reports a refused storage permission from SaveFile', async () => {
        const { deps } = makeDeps([fileResult], {
            save: jest.fn(async () => Promise.reject(failure('PERMISSION_DENIED'))),
        });
        await expect(exportFile(input('save'), deps)).resolves.toEqual({ kind: 'permission' });
    });

    it('stays quiet on a timeout and logs the shell refusing its own file', async () => {
        const slow = makeDeps([fileResult], { open: jest.fn(async () => Promise.reject(failure('TIMEOUT'))) });
        await expect(exportFile(input('open'), slow.deps)).resolves.toEqual({ kind: 'timed-out' });

        const refused = makeDeps([fileResult], { save: jest.fn(async () => Promise.reject(failure('INVALID'))) });
        await expect(exportFile(input('save'), refused.deps)).resolves.toEqual({ kind: 'failed' });
        expect(refused.deps.log).toHaveBeenCalled();
    });

    it('fails on a download that brought no file', async () => {
        const { deps } = makeDeps([{ kind: 'failed', reason: 'network' }]);
        await expect(exportFile(input('save'), deps)).resolves.toEqual({ kind: 'failed' });
        expect(deps.keep).not.toHaveBeenCalled();
    });

    it('cancels the download when the signal aborts', async () => {
        const controller = new AbortController();
        let finish: (result: DownloadResult) => void = () => undefined;
        const cancel = jest.fn(() => finish({ kind: 'cancelled' }));
        const { deps } = makeDeps([], {
            download: jest.fn(() => ({
                transferId: 'd-1',
                result: new Promise<DownloadResult>(resolve => (finish = resolve)),
                cancel,
            })),
        });

        const running = exportFile({ ...input('save'), signal: controller.signal }, deps);
        controller.abort();

        await expect(running).resolves.toEqual({ kind: 'cancelled' });
        expect(cancel).toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
});
