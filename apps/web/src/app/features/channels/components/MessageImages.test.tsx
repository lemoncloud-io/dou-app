import '@testing-library/jest-dom';

import { act, fireEvent, render, screen } from '@testing-library/react';

import type { DomainChat } from '@chatic/data';

import { MessageImages } from './MessageImages';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, vars?: { position?: number }) => (vars?.position ? `${key}:${vars.position}` : key),
    }),
}));
let mockNative = false;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
const mockDownload = jest.fn();
jest.mock('../lib/fileDownload', () => ({ downloadInBrowser: (...args: unknown[]) => mockDownload(...args) }));
const toast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: (arg: unknown) => toast(arg) }));
const refresh = jest.fn().mockResolvedValue(true);
jest.mock('../hooks/useImageAddressRefresh', () => ({ useImageAddressRefresh: () => refresh }));

// The cache has its own suite. Here it answers per request: by default every image is drawn from its
// signed address, as when the cache cannot fetch; a test can resolve some keys to a kept copy instead.
type Request = { key: string; variant: string; url: string } | undefined;
const cachedKeys = new Map<string, string | 'pending'>();
const rejected: string[] = [];
const requested: Request[][] = [];
const leads: (number | undefined)[] = [];
jest.mock('../hooks/useCachedImages', () => ({
    useCachedImages: (requests: Request[], lead?: number) => {
        requested.push(requests);
        leads.push(lead);
        return {
            images: requests.map(request => {
                if (!request) return undefined;
                const kept = cachedKeys.get(request.key);
                if (kept === 'pending') return { status: 'pending' };
                return kept ? { status: 'cached', src: kept } : { status: 'direct', src: request.url };
            }),
            reject: (index: number) => {
                const request = requests[index];
                if (!request || !cachedKeys.has(request.key)) return false;
                rejected.push(request.key);
                return true;
            },
        };
    },
}));

type Uploads = NonNullable<DomainChat['upload$$']>;
const sent = (id: string, thumb: string) =>
    ({ id, status: 'stored', orgUrl: `https://s3/${id}`, thumbUrl: thumb }) as Uploads[number];

beforeEach(() => {
    mockNative = false;
    mockDownload.mockReset();
    toast.mockClear();
    refresh.mockClear();
    cachedKeys.clear();
    rejected.length = 0;
    requested.length = 0;
    leads.length = 0;
});

describe('MessageImages', () => {
    // A cached row keeps addresses that expire; the message is read again for fresh ones.
    it('re-reads the message from its cloud when an image fails, and shows a placeholder meanwhile', () => {
        const uploads = [sent('u1', 'https://s3/u1-thumb-old'), sent('u2', 'https://s3/u2-thumb')];
        const { container } = render(<MessageImages uploads={uploads} chatId="ch1:5" cid="cloud-b" align="start" />);

        act(() => {
            fireEvent.error(container.querySelectorAll('img')[0]);
        });

        expect(refresh).toHaveBeenCalledWith({ cid: 'cloud-b', chatId: 'ch1:5', src: 'https://s3/u1-thumb-old' });
        expect(container.querySelectorAll('img')).toHaveLength(1);
    });

    it('draws the fresh address once the re-read brings one', () => {
        const { container, rerender } = render(
            <MessageImages uploads={[sent('u1', 'https://s3/old')]} chatId="ch1:5" cid="c" align="start" />
        );
        act(() => {
            fireEvent.error(container.querySelector('img') as HTMLImageElement);
        });
        expect(container.querySelector('img')).toBeNull();

        rerender(<MessageImages uploads={[sent('u1', 'https://s3/new')]} chatId="ch1:5" cid="c" align="start" />);

        expect(container.querySelector('img')).toHaveAttribute('src', 'https://s3/new');
    });

    // A message still on its way draws from a local preview; there is nothing to re-read.
    it('never re-reads for a local preview', () => {
        const uploads = [{ localStatus: 'sending', localThumbUrl: 'blob:1' }] as Uploads;
        const { container } = render(<MessageImages uploads={uploads} chatId="tmp-1" cid="c" align="end" />);

        fireEvent.error(container.querySelector('img') as HTMLImageElement);

        expect(refresh).not.toHaveBeenCalled();
    });

    it('opens the original and re-reads when the open original fails', () => {
        const uploads = [sent('u1', 'https://s3/u1-thumb')];
        render(<MessageImages uploads={uploads} chatId="ch1:5" cid="c" align="start" />);

        fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:1' }));
        const viewerImage = screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement;
        expect(viewerImage).toHaveAttribute('src', 'https://s3/u1');

        fireEvent.error(viewerImage);
        expect(refresh).toHaveBeenCalledWith({ cid: 'c', chatId: 'ch1:5', src: 'https://s3/u1' });
    });

    describe("stepping through a message's images", () => {
        const many = (count: number) =>
            Array.from({ length: count }, (_, i) => sent(`u${i}`, `https://s3/u${i}-thumb`));
        const viewerSrc = () =>
            (screen.getByRole('dialog').querySelector('img[data-current]') as HTMLImageElement).getAttribute('src');

        it('opens at the tapped image and steps to the next one', () => {
            render(<MessageImages uploads={many(3)} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:2' }));
            expect(viewerSrc()).toBe('https://s3/u1');
            expect(screen.getByText('2 / 3')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));
            expect(viewerSrc()).toBe('https://s3/u2');
        });

        // The tiles show four and a "+n"; the viewer still reaches the ones behind it.
        it('reaches the images hidden behind the "+n" tile', () => {
            render(<MessageImages uploads={many(6)} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:4' }));
            expect(screen.getByText('4 / 6')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            expect(viewerSrc()).toBe('https://s3/u5');
        });

        it('skips a broken image instead of showing a blank page', () => {
            const uploads = [
                sent('u0', 'https://s3/t0'),
                { id: 'u1', status: 'failed' } as Uploads[number],
                sent('u2', 'https://s3/t2'),
            ];
            render(<MessageImages uploads={uploads} chatId="ch1:5" cid="c" align="start" />);

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:1' }));
            expect(screen.getByText('1 / 2')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            expect(viewerSrc()).toBe('https://s3/u2');
        });
    });
    describe('through the image cache', () => {
        const many = (count: number) =>
            Array.from({ length: count }, (_, i) => sent(`u${i}`, `https://s3/u${i}-thumb`));
        const viewer = () => screen.getByRole('dialog');

        it('draws a kept copy instead of the signed address', () => {
            cachedKeys.set('c/u1/thumb', 'blob:kept-u1');
            const { container } = render(
                <MessageImages uploads={[sent('u1', 'https://s3/u1-thumb')]} chatId="ch1:5" cid="c" align="start" />
            );

            expect(container.querySelector('img')).toHaveAttribute('src', 'blob:kept-u1');
        });

        // Starting the signed download alongside the lookup would spend the download the cache saves.
        it('draws nothing while the copy is looked up', () => {
            cachedKeys.set('c/u1/thumb', 'pending');
            const { container } = render(
                <MessageImages uploads={[sent('u1', 'https://s3/u1-thumb')]} chatId="ch1:5" cid="c" align="start" />
            );

            expect(container.querySelector('img')).toBeNull();
        });

        // A kept copy that does not decode is dropped; its address has not expired, so nothing is re-read.
        it('drops a kept copy that fails, without re-reading the message', () => {
            cachedKeys.set('c/u1/thumb', 'blob:bad');
            const { container } = render(
                <MessageImages uploads={[sent('u1', 'https://s3/u1-thumb')]} chatId="ch1:5" cid="c" align="start" />
            );

            fireEvent.error(container.querySelector('img') as HTMLImageElement);

            expect(rejected).toEqual(['c/u1/thumb']);
            expect(refresh).not.toHaveBeenCalled();
        });

        it('keys each image by its cloud and upload, and asks only for the tiles that are drawn', () => {
            render(<MessageImages uploads={many(6)} chatId="ch1:5" cid="cloud-b" align="start" />);

            const [thumbs, originals] = requested.slice(-2);
            expect(thumbs.map(request => request?.key)).toEqual([
                'cloud-b/u0/thumb',
                'cloud-b/u1/thumb',
                'cloud-b/u2/thumb',
                'cloud-b/u3/thumb',
                undefined,
                undefined,
            ]);
            // No original is fetched until the viewer opens.
            expect(originals.every(request => request === undefined)).toBe(true);
        });

        it('asks for the open original and its neighbours, with their tiles as placeholders', () => {
            cachedKeys.set('c/u4/org', 'blob:o4');
            cachedKeys.set('c/u5/thumb', 'blob:t5');
            render(<MessageImages uploads={many(6)} chatId="ch1:5" cid="c" align="start" />);

            // Tile 4 is u3; one step on shows u4, between u3 and u5.
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:4' }));
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            const [thumbs, originals] = requested.slice(-2);
            expect(originals.map(request => request?.key)).toEqual([
                undefined,
                undefined,
                undefined,
                'c/u3/org',
                'c/u4/org',
                'c/u5/org',
            ]);
            // Behind the "+n" tile, yet drawn as a placeholder beside the open image.
            expect(thumbs[5]?.key).toBe('c/u5/thumb');
            expect(viewer().querySelector('img[data-current]')).toHaveAttribute('src', 'blob:o4');
            expect(viewer().querySelector('img[data-placeholder][src="blob:t5"]')).toBeInTheDocument();
        });

        // Three originals fetched side by side split a slow network three ways, and the one being looked
        // at is the one that matters.
        it('leads with the open original, ahead of its neighbours', () => {
            render(<MessageImages uploads={many(6)} chatId="ch1:5" cid="c" align="start" />);
            expect(leads.at(-1)).toBeUndefined();

            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.tile:4' }));
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.viewerNext' }));

            const originals = requested.at(-1) ?? [];
            expect(originals[leads.at(-1) as number]?.key).toBe('c/u4/org');
            // The thumbnails have no lead: a row's tiles are all on screen at once.
            expect(leads.at(-2)).toBeUndefined();
        });

        it('never asks the cache for a local preview', () => {
            const uploads = [{ localStatus: 'sending', localThumbUrl: 'blob:local' }] as Uploads;
            const { container } = render(<MessageImages uploads={uploads} chatId="tmp-1" cid="c" align="end" />);

            expect(requested.at(-2)).toEqual([undefined]);
            expect(container.querySelector('img')).toHaveAttribute('src', 'blob:local');
        });
    });
});

describe('MessageImages — videos and documents', () => {
    const video = (id: string, poster?: string) =>
        ({
            id,
            status: 'stored',
            stereo: 'video',
            orgUrl: `https://s3/${id}`,
            ...(poster ? { thumbUrl: poster } : {}),
        }) as Uploads[number];
    const pdf = (id: string, name?: string) =>
        ({
            id,
            status: 'stored',
            stereo: 'file',
            contentSize: 2048,
            orgUrl: `https://s3/${id}`,
            ...(name ? { name } : {}),
        }) as Uploads[number];

    it('draws photos and videos as tiles in sent order and documents as cards below them', () => {
        const uploads = [
            sent('p1', 'https://s3/p1-t'),
            pdf('d1', 'quote.pdf'),
            sent('p2', 'https://s3/p2-t'),
            video('v1'),
        ];
        const { container } = render(<MessageImages uploads={uploads} chatId="c:1" cid="c" align="start" />);

        expect(
            screen
                .getAllByRole('button', { name: /chat\.attach\.tile(Video)?:/ })
                .map(b => b.getAttribute('aria-label'))
        ).toEqual(['chat.attach.tile:1', 'chat.attach.tile:2', 'chat.attach.tileVideo:3']);
        expect(container.querySelector('video')).toBeNull();
        expect(container.querySelector('[data-video-panel]')).not.toBeNull();
        expect(screen.getByText('quote')).toBeInTheDocument();
    });

    it('downloads a document under its own name from the card’s button in a browser', async () => {
        mockDownload.mockResolvedValue('saved');
        render(<MessageImages uploads={[pdf('d1', 'quote.pdf')]} chatId="c:1" cid="c" align="start" />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.fileCard.download' }));
        });

        expect(mockDownload).toHaveBeenCalledWith('https://s3/d1', 'quote.pdf', { signal: expect.any(AbortSignal) });
        expect(toast).not.toHaveBeenCalled();
    });

    it('reads the message again when the document’s address has expired, and says it failed', async () => {
        mockDownload.mockResolvedValue('expired');
        render(<MessageImages uploads={[pdf('d1', 'quote.pdf')]} chatId="c:1" cid="c" align="start" />);

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'chat.attach.fileCard.download' }));
        });

        expect(refresh).toHaveBeenCalledWith({ cid: 'c', chatId: 'c:1', src: 'https://s3/d1' });
        expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'chat.attach.fileCard.downloadFailed' }));
    });

    it('names an unnamed document with the generic label', () => {
        render(<MessageImages uploads={[pdf('d1')]} chatId="c:1" cid="c" align="start" />);

        expect(screen.getAllByText('chat.attach.fileCard.fallbackName').length).toBeGreaterThan(0);
    });
});
