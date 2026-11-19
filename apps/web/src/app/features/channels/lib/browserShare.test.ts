import { canShareFilesInBrowser, shareFileInBrowser, type ShareNavigator } from './browserShare';

const navigatorWith = (share: ShareNavigator['share'], canShare: ShareNavigator['canShare'] = () => true) =>
    ({ share, canShare }) as ShareNavigator;

const domError = (name: string) => Object.assign(new Error(name), { name });

describe('canShareFilesInBrowser', () => {
    it('is true only where the browser says it shares a file', () => {
        expect(canShareFilesInBrowser(navigatorWith(jest.fn()))).toBe(true);
        expect(canShareFilesInBrowser(navigatorWith(jest.fn(), () => false))).toBe(false);
    });

    it('is false without the Web Share API, or when asking throws', () => {
        expect(canShareFilesInBrowser(undefined)).toBe(false);
        expect(canShareFilesInBrowser({} as ShareNavigator)).toBe(false);
        expect(
            canShareFilesInBrowser(
                navigatorWith(jest.fn(), () => {
                    throw new TypeError('no files');
                })
            )
        ).toBe(false);
    });
});

describe('shareFileInBrowser', () => {
    it('shares the file alone, named and typed by the upload when the bucket typed it generically', async () => {
        const share = jest.fn(async () => undefined);
        const result = await shareFileInBrowser(
            new Blob(['%PDF'], { type: 'application/octet-stream' }),
            '회의록.pdf',
            navigatorWith(share)
        );

        expect(result).toBe('shared');
        const [data] = share.mock.calls[0] as unknown as [ShareData];
        expect(Object.keys(data)).toEqual(['files']);
        expect(data.files?.[0].name).toBe('회의록.pdf');
        expect(data.files?.[0].type).toBe('application/pdf');
    });

    it('keeps a type the response already named', async () => {
        const share = jest.fn(async () => undefined);
        await shareFileInBrowser(new Blob(['x'], { type: 'image/png' }), 'photo', navigatorWith(share));

        const [data] = share.mock.calls[0] as unknown as [ShareData];
        expect(data.files?.[0].type).toBe('image/png');
    });

    it('reads a closed sheet as dismissed and a stale tap as needing another', async () => {
        const blob = new Blob(['x']);
        await expect(
            shareFileInBrowser(blob, 'a.pdf', navigatorWith(jest.fn().mockRejectedValue(domError('AbortError'))))
        ).resolves.toBe('dismissed');
        await expect(
            shareFileInBrowser(blob, 'a.pdf', navigatorWith(jest.fn().mockRejectedValue(domError('NotAllowedError'))))
        ).resolves.toBe('needs-gesture');
    });

    it('fails when the browser cannot share this file, or the share breaks', async () => {
        const blob = new Blob(['x']);
        const share = jest.fn();
        await expect(
            shareFileInBrowser(
                blob,
                'a.pdf',
                navigatorWith(share, () => false)
            )
        ).resolves.toBe('failed');
        expect(share).not.toHaveBeenCalled();
        await expect(
            shareFileInBrowser(blob, 'a.pdf', navigatorWith(jest.fn().mockRejectedValue(domError('DataError'))))
        ).resolves.toBe('failed');
        await expect(shareFileInBrowser(blob, 'a.pdf', undefined)).resolves.toBe('failed');
    });
});
