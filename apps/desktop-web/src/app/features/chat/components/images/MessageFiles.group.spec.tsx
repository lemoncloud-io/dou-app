import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { DomainChat } from '@chatic/data';
import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import { downloadImages } from '../../utils';
import type * as Utils from '../../utils';
import { MessageFiles } from './MessageFiles';

import '../../../../../i18n';

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

// jsdom implements no playback; a voice card's player is paused when it unmounts.
vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

const savedNames = () => vi.mocked(downloadImages).mock.calls.flatMap(([files]) => files.map(file => file.name));

beforeEach(() => vi.mocked(downloadImages).mockClear());
afterEach(cleanup);

describe('a message with several files', () => {
    it('heads them with their count and a download for all of them', () => {
        render(<MessageFiles author={author} message={sent([voice('a', 'one.mp3'), voice('b', 'two.mp3')])} />, {
            wrapper,
        });
        expect(screen.getByRole('button', { name: '2 attachments' })).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(savedNames()).toEqual(['one.mp3', 'two.mp3']);
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
        // jsdom applies no stylesheet: a display utility on the folded list would beat `[hidden]` and
        // keep it on screen, so the folded list must carry none.
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

    it('downloads only the files there is something to load for', () => {
        render(
            <MessageFiles
                author={author}
                message={sent([voice('a', 'one.mp3'), { id: 'b', status: 'failed', stereo: 'file', name: 'two.mp3' }])}
            />,
            { wrapper }
        );
        fireEvent.click(screen.getByRole('button', { name: 'Download all' }));
        expect(savedNames()).toEqual(['one.mp3']);
    });
});
