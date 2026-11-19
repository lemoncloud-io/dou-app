import { pageLinks } from './pageLinks';

describe('pageLinks', () => {
    afterEach(() => jest.restoreAllMocks());

    it('opens a link in a new tab the page keeps no handle on', () => {
        const open = jest.spyOn(window, 'open').mockReturnValue(null);
        pageLinks.openUrl('https://example.com');
        expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    });

    it('copies with the Clipboard API and answers true', async () => {
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        await expect(pageLinks.copyText('hello')).resolves.toBe(true);
        expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('rejects where there is no Clipboard API, rather than answering false', async () => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
        await expect(pageLinks.copyText('hello')).rejects.toThrow('Clipboard API is not available.');
    });
});
