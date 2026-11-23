import { Blob as NodeBlob } from 'node:buffer';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { unzipSync } from 'fflate';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/runtime';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';
import type * as UseToast from '@chatic/ui-kit/components/ui/use-toast';

import { downloadImages } from '../../utils';
import type * as Utils from '../../utils';
import { MessageFiles } from './MessageFiles';

import '../../../../../i18n';

vi.mock('@chatic/ui-kit/components/ui/use-toast', async importOriginal => ({
    ...(await importOriginal<typeof UseToast>()),
    toast: vi.fn(),
}));

vi.mock('../../utils', async importOriginal => ({
    ...(await importOriginal<typeof Utils>()),
    downloadImages: vi.fn(),
}));

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;
const author = { name: 'Ada', colorSeed: 'ada', time: '7:43 PM' };
const sent = (upload$$: unknown[]) => ({ id: 'row-1', channelId: 'ch-1', upload$$ }) as DomainChat;
const voice = (id: string, name: string) => ({
    id,
    stereo: 'file',
    name,
    contentType: 'audio/mpeg',
    contentSize: 10,
    orgUrl: `https://s/${id}`,
});

vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

const savedNames = () => vi.mocked(downloadImages).mock.calls.flatMap(([files]) => files.map(file => file.name));

const readBytes = (blob: Blob) =>
    new Promise<Uint8Array>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.readAsArrayBuffer(blob);
    });

let saves: { name: string; blob: Blob }[] = [];
let objectUrls = new Map<string, Blob>();

beforeEach(() => {
    vi.mocked(downloadImages).mockClear();
    vi.mocked(toast).mockClear();
    saves = [];
    objectUrls = new Map();
    URL.createObjectURL = vi.fn((blob: Blob) => {
        const href = `blob:zip-${objectUrls.size}`;
        objectUrls.set(href, blob);
        return href;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        const blob = objectUrls.get(this.getAttribute('href') ?? '');
        if (blob) saves.push({ name: this.download, blob });
    });
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => ({
            ok: !url.includes('gone'),
            status: url.includes('gone') ? 403 : 200,
            blob: async () =>
                new NodeBlob([`bytes of ${url}`], { type: url.endsWith('.pdf') ? 'application/pdf' : '' }),
        }))
    );
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const zippedNames = async () => {
    await waitFor(() => expect(saves).toHaveLength(1));
    return Object.keys(unzipSync(await readBytes(saves[0].blob)));
};

describe('a message with several files', () => {
    it('heads them with their count and a download for all of them, saved as one zip', async () => {
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3'), voice('b', 'two.mp3')])} />, {
            wrapper,
        });
        expect(screen.getByRole('button', { name: '2 attachments' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(await zippedNames()).toEqual(['one.mp3', 'two.mp3']);
        expect(saves[0].name).toMatch(/^attachments_\d{4}-\d{2}-\d{2}\.zip$/);
        expect(downloadImages).not.toHaveBeenCalled();
    });

    it('folds the files away and back', () => {
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3'), voice('b', 'two.mp3')])} />, {
            wrapper,
        });
        const toggle = screen.getByRole('button', { name: '2 attachments' });
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        expect(screen.getByRole('list')).toBeTruthy();

        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('list')).toBeNull();
        const folded = document.getElementById(toggle.getAttribute('aria-controls') ?? '') as HTMLElement;
        expect(folded.hidden).toBe(true);
        expect(folded.classList.contains('flex')).toBe(false);

        fireEvent.click(toggle);
        expect(screen.getByRole('list')).toBeTruthy();
    });

    it('leaves a single file without a head', () => {
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3')])} />, { wrapper });
        expect(screen.queryByRole('button', { name: /attachments/ })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull();
    });

    it('downloads only the files there is something to load for', async () => {
        render(
            <MessageFiles
                author={author}
                message={sent([voice('a', 'one.mp3'), { id: 'b', status: 'failed', stereo: 'file', name: 'two.mp3' }])}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(await zippedNames()).toEqual(['one.mp3']);
    });

    it('zips nine PDFs of one message with their Korean names into a single save', async () => {
        const names = Array.from({ length: 9 }, (_, i) => `회사${i + 1}_결과보고_발표.pdf`);
        const pdfs = names.map((name, i) => ({
            id: `p${i}`,
            stereo: 'file',
            name,
            contentType: 'application/pdf',
            contentSize: 3_800_000,
            orgUrl: `https://s/p${i}`,
        }));
        render(<MessageFiles author={author} message={sent(pdfs)} />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(await zippedNames()).toEqual(names);
    });

    it('zips what loaded when one file cannot be fetched', async () => {
        render(
            <MessageFiles
                author={author}
                message={sent([voice('a', 'one.mp3'), { ...voice('gone', 'two.mp3'), orgUrl: 'https://s/gone' }])}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(await zippedNames()).toEqual(['one.mp3']);
        expect(vi.mocked(toast)).toHaveBeenCalledWith(
            expect.objectContaining({ description: "Some files couldn't be downloaded and were left out of the zip" })
        );
    });

    it('saves nothing and says so when no file can be fetched', async () => {
        const gone = (id: string, name: string) => ({ ...voice(id, name), orgUrl: `https://s/gone-${id}` });
        render(<MessageFiles author={author} message={sent([gone('a', 'one.mp3'), gone('b', 'two.mp3')])} />, {
            wrapper,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        await waitFor(() =>
            expect(vi.mocked(toast)).toHaveBeenCalledWith(
                expect.objectContaining({ description: "Couldn't save the file" })
            )
        );
        expect(saves).toEqual([]);
    });

    it('is off and reads Preparing while the zip is built', async () => {
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3'), voice('b', 'two.mp3')])} />, {
            wrapper,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect((screen.getByRole('button', { name: 'Preparing…' }) as HTMLButtonElement).disabled).toBe(true);
        await zippedNames();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Download all' })).toBeTruthy());
    });

    it('names a nameless document by the type of its bytes inside the zip', async () => {
        const unnamed = {
            id: 'n',
            stereo: 'file',
            contentType: 'application/pdf',
            contentSize: 10,
            orgUrl: 'https://s/n.pdf',
        };
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3'), unnamed])} />, { wrapper });
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(await zippedNames()).toEqual(['one.mp3', 'file.pdf']);
    });

    it('saves files one by one when together they are too large to zip', () => {
        const big = (id: string, name: string) => ({ ...voice(id, name), contentSize: 200 * 1024 * 1024 });
        render(<MessageFiles author={author} message={sent([big('a', 'one.mp3'), big('b', 'two.mp3')])} />, {
            wrapper,
        });
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(savedNames()).toEqual(['one.mp3', 'two.mp3']);
    });
});
