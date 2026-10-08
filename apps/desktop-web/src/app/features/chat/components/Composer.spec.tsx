import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useComposerDraftStore } from '../../../shared';
import type { ComposerAttachment } from '../hooks';
import { Composer } from './Composer';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

// Lexical moves DOM focus after its own update cycle, a tick after mount.
const settle = () => act(() => new Promise(resolve => setTimeout(resolve, 100)));

describe('Composer autoFocus', () => {
    afterEach(cleanup);

    // Opening a thread left focus in the feed behind the panel.
    it('takes focus on mount when asked', async () => {
        const { container } = render(<Composer onSend={() => undefined} channelId="C1" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(container.querySelector('[data-composer-input]'));
    });

    it('leaves focus alone otherwise', async () => {
        const { container } = render(<Composer onSend={() => undefined} channelId="C2" />, { wrapper });
        await settle();
        expect(document.activeElement).not.toBe(container.querySelector('[data-composer-input]'));
    });

    // A thread can open seconds after the click, once its channel loads; by then the reader
    // may be typing in the channel's composer.
    it('does not take focus from a field the reader is typing in', async () => {
        const field = document.createElement('input');
        document.body.appendChild(field);
        field.focus();
        render(<Composer onSend={() => undefined} channelId="C3" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(field);
        field.remove();
    });
});

describe('Composer paste', () => {
    afterEach(cleanup);

    const paste = (target: Element, data: { files: File[]; text?: string; types: string[] }) =>
        fireEvent.paste(target, {
            clipboardData: {
                files: data.files,
                types: data.types,
                getData: (type: string) => (type === 'text/plain' ? (data.text ?? '') : ''),
            },
        });

    // Excel and Word put the cells' text and a picture of them on the clipboard together;
    // taking the picture used to throw the text away.
    it('keeps the text of a paste that also carries an image', async () => {
        const onAddFiles = vi.fn();
        const { container } = render(
            <Composer onSend={() => undefined} channelId="P1" onAddFiles={onAddFiles} onRemoveAttachment={vi.fn()} />,
            { wrapper }
        );
        await settle();
        const input = container.querySelector('[data-composer-input]') as HTMLElement;
        const image = new File(['x'], 'cells.png', { type: 'image/png' });
        await act(async () => {
            paste(input, { files: [image], text: 'Q3 total 1,204', types: ['Files', 'text/plain', 'text/html'] });
        });
        await settle();
        expect(onAddFiles).toHaveBeenCalledWith([image]);
        expect(input.textContent).toContain('Q3 total 1,204');
    });

    // Finder and Explorer put a copied file's name on the clipboard as plain text.
    it('does not type the name of a copied file into the message', async () => {
        const { container } = render(
            <Composer onSend={() => undefined} channelId="P2" onAddFiles={vi.fn()} onRemoveAttachment={vi.fn()} />,
            { wrapper }
        );
        await settle();
        const input = container.querySelector('[data-composer-input]') as HTMLElement;
        const image = new File(['x'], 'IMG_1234.png', { type: 'image/png' });
        await act(async () => {
            paste(input, { files: [image], text: 'IMG_1234.png', types: ['Files', 'text/plain'] });
        });
        await settle();
        expect(input.textContent).not.toContain('IMG_1234.png');
    });
});

describe('Composer send', () => {
    afterEach(cleanup);
    beforeEach(() => {
        useComposerDraftStore.setState({ drafts: {} });
    });

    const picked = (): ComposerAttachment => {
        const file = new File(['a'], 'a.png', { type: 'image/png' });
        return { id: 'attachment-1', key: 'a.png:1:1', name: 'a.png', url: 'blob:a', file };
    };

    const renderComposer = (attachments: ComposerAttachment[], onSend = vi.fn()) => {
        render(
            <Composer
                channelId="ch-1"
                onSend={onSend}
                attachments={attachments}
                onAddFiles={vi.fn()}
                onRemoveAttachment={vi.fn()}
            />,
            { wrapper }
        );
        return onSend;
    };

    const sendButton = () => screen.getByRole('button', { name: 'Send' });

    it('sends pictures on their own, with no text', async () => {
        const attachment = picked();
        const onSend = renderComposer([attachment]);

        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).toHaveBeenCalledWith('', [attachment.file]);
    });

    it('hands the text and the files up together', async () => {
        useComposerDraftStore.setState({ drafts: { 'ch-1': 'caption' } });
        const attachment = picked();
        const onSend = renderComposer([attachment]);
        // The editor loads the channel's draft after it mounts.
        await screen.findByText('caption');

        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).toHaveBeenCalledWith('caption', [attachment.file]);
    });

    // The editor's markdown export backslash-escapes `_ * ~ \``; RichText has no escape syntax, so
    // the reader would see the backslashes. The wire carries the text as typed; the text reaches
    // the editor as a restored draft, which goes through the same import as an opened message.
    it.each(['snake_case_name', 'a * b', '\\\\server\\share'])(
        'sends %j without adding or dropping backslashes',
        async text => {
            useComposerDraftStore.setState({ drafts: { 'ch-1': text } });
            const onSend = renderComposer([]);
            await waitFor(() => expect((sendButton() as HTMLButtonElement).disabled).toBe(false));

            await act(async () => fireEvent.click(sendButton()));

            expect(onSend).toHaveBeenCalledWith(text, []);
        }
    );

    it('sends nothing when there is neither text nor a picture', async () => {
        const onSend = renderComposer([]);

        expect((sendButton() as HTMLButtonElement).disabled).toBe(true);
        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).not.toHaveBeenCalled();
    });
});

// The thread panel's 360px default left the reply box about 160px with the room's spacing, and
// its placeholder wrapped to a second line. jsdom lays nothing out, so these pin the classes
// that decide it; the width itself needs a browser.
describe('Composer compact', () => {
    afterEach(cleanup);

    it('keeps the placeholder on one line', () => {
        render(<Composer onSend={() => undefined} channelId="C9" placeholder="Reply in thread" compact />, {
            wrapper,
        });

        expect(screen.getByText('Reply in thread').className).toContain('truncate');
    });

    it('tightens the spacing only when asked', () => {
        const { container, unmount } = render(<Composer onSend={() => undefined} channelId="C10" compact />, {
            wrapper,
        });
        expect((container.firstElementChild as HTMLElement).className).toContain('px-3');
        unmount();

        const { container: room } = render(<Composer onSend={() => undefined} channelId="C11" />, { wrapper });
        expect((room.firstElementChild as HTMLElement).className).toContain('px-6');
    });
});
