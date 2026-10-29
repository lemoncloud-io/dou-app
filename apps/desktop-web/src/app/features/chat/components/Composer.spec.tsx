import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { useComposerDraftStore, useComposerFocusStore } from '../../../shared';
import type { ComposerAttachment } from '../hooks';
import { Composer } from './Composer';
import { $createMentionNode } from './editor/MentionNode';

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

    // A rail chord opens the room from the keyboard: taking the caret would make the next chord
    // type its character ("!" for Shift+1) into the box instead of moving.
    it('does not take the caret when the rail asked it not to', async () => {
        useComposerFocusStore.getState().requestSkip();
        const blur = vi.spyOn(HTMLElement.prototype, 'blur');
        const { container } = render(<Composer onSend={() => undefined} channelId="C5" />, { wrapper });
        await settle();
        const input = container.querySelector('[data-composer-input]');
        expect(blur.mock.instances).toContain(input);
        useComposerFocusStore.getState().clearSkip();
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

    // A channel removal asks for focus when the server answers, about a second after the confirm;
    // by then the reader can have opened the next room's More menu, and taking focus closed it.
    const focusInside = (role: string, state: 'open' | 'closed') => {
        const box = document.createElement('div');
        box.setAttribute('role', role);
        box.setAttribute('data-state', state);
        const control = document.createElement('button');
        box.appendChild(control);
        document.body.appendChild(box);
        control.focus();
        return { control, remove: () => box.remove() };
    };

    it.each(['menu', 'dialog', 'alertdialog'])('does not take focus from an open %s', async role => {
        const { control, remove } = focusInside(role, 'open');
        render(<Composer onSend={() => undefined} channelId="C4" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(control);
        remove();
    });

    // The image viewer's Reply closes the viewer as it opens the thread; the viewer keeps focus
    // while it fades out, and the thread's box still takes it.
    it('takes focus from a dialog that is closing', async () => {
        const { remove } = focusInside('dialog', 'closed');
        const { container } = render(<Composer onSend={() => undefined} channelId="C5" autoFocus />, { wrapper });
        await settle();
        expect(document.activeElement).toBe(container.querySelector('[data-composer-input]'));
        remove();
    });
});

describe('Composer format row', () => {
    afterEach(cleanup);

    // A format that was on drew exactly what hover draws, so the row never showed it.
    it('draws a format that is on apart from one that is off', async () => {
        render(<Composer onSend={() => undefined} channelId="C-format" autoFocus />, { wrapper });
        await settle();
        const bold = screen.getByRole('button', { name: i18next.t('chat.composer.format.bold') });
        const italic = screen.getByRole('button', { name: i18next.t('chat.composer.format.italic') });
        expect(bold.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(bold);
        await waitFor(() => expect(bold.getAttribute('aria-pressed')).toBe('true'));
        expect(bold.className).toContain('ring-control-border');
        expect(italic.className).not.toContain('ring-control-border');
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

    // The tray's preview is portalled out of the composer, but React still bubbles its paste here.
    it('does not add files pasted inside an attachment preview', async () => {
        const onAddFiles = vi.fn();
        const picked = new File(['x'], 'a.png', { type: 'image/png' });
        const attachment: ComposerAttachment = {
            id: 'a',
            key: 'a',
            name: 'a.png',
            url: 'blob:a',
            file: picked,
            kind: 'image',
            size: 1,
        };
        render(
            <Composer
                onSend={() => undefined}
                channelId="P3"
                attachments={[attachment]}
                onAddFiles={onAddFiles}
                onRemoveAttachment={vi.fn()}
            />,
            { wrapper }
        );
        await settle();
        fireEvent.click(screen.getByRole('button', { name: 'Open a.png' }));
        const image = new File(['x'], 'b.png', { type: 'image/png' });
        await act(async () => {
            paste(screen.getByRole('dialog'), { files: [image], types: ['Files'] });
        });
        expect(onAddFiles).not.toHaveBeenCalled();
    });
});

describe('Composer empty code block', () => {
    afterEach(cleanup);

    // A code block with nothing in it still exports its fences; that is not a message.
    it('neither keeps it as a draft nor offers to send it', async () => {
        useComposerDraftStore.setState({ drafts: { E1: '```\n```' } });
        const onSend = vi.fn();
        const { container } = render(<Composer onSend={onSend} channelId="E1" />, { wrapper });
        await settle();

        expect(container.querySelector('[data-composer-input] code')).not.toBeNull();
        expect(useComposerDraftStore.getState().drafts.E1).toBeUndefined();
        const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
        expect(send.disabled).toBe(true);
        await act(async () => fireEvent.click(send));
        expect(onSend).not.toHaveBeenCalled();
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

    // Reaches the composer's own editor the way a pick does: the chip is what the list inserts.
    const insertPick = async (container: HTMLElement, name: string, userId: string) => {
        // Lexical keeps its editor on the root element it was given; the DOM type does not say so.
        const root = container.querySelector('[data-composer-input]') as HTMLElement & {
            __lexicalEditor: LexicalEditor;
        };
        await act(async () =>
            root.__lexicalEditor.update(
                () => {
                    $getRoot()
                        .clear()
                        .append(
                            $createParagraphNode().append(
                                $createMentionNode(`@${name}`, { userId }),
                                $createTextNode(' hi')
                            )
                        );
                },
                { discrete: true }
            )
        );
    };

    it('hands up who was picked, read before the box is emptied', async () => {
        const onSend = vi.fn();
        const { container } = render(<Composer channelId="ch-1" onSend={onSend} />, { wrapper });
        await settle();
        await insertPick(container, 'Ada', 'u-ada');
        await waitFor(() => expect(sendButton()).toHaveProperty('disabled', false));

        await act(async () => fireEvent.click(sendButton()));

        expect(onSend).toHaveBeenCalledWith('@Ada hi', [], { userIds: ['u-ada'] });
    });

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

// Slack's arrangement: formats above the text, the message's own actions along the bottom.
describe('Composer layout', () => {
    beforeEach(() => useComposerDraftStore.setState({ drafts: {} }));
    afterEach(cleanup);

    const mount = async () => {
        const { container } = render(
            <Composer onSend={() => undefined} channelId="L1" onAddFiles={vi.fn()} onRemoveAttachment={vi.fn()} />,
            { wrapper }
        );
        await settle();
        return container;
    };

    const follows = (first: Element, second: Element) =>
        (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

    it('offers inline and block formats in the row above the text', async () => {
        await mount();
        const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });

        expect(Array.from(toolbar.querySelectorAll('button')).map(button => button.getAttribute('aria-label'))).toEqual(
            ['Bold (⌘B)', 'Italic (⌘I)', 'Strikethrough (⌘⇧X)', 'Code (⌘⇧C)', 'Link', 'Quote', 'Code block (⌘⇧⌥C)']
        );
    });

    it('puts attach and emoji at the bottom left and send last, all below the text', async () => {
        const container = await mount();
        const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
        const input = container.querySelector('[data-composer-input]') as HTMLElement;
        const attach = screen.getByRole('button', { name: 'Attach files' });
        const emoji = screen.getByRole('button', { name: 'Emoji' });
        const send = screen.getByRole('button', { name: 'Send' });

        expect(follows(toolbar, input)).toBe(true);
        expect(follows(input, attach)).toBe(true);
        expect(follows(attach, emoji)).toBe(true);
        expect(follows(emoji, send)).toBe(true);
        const buttons = Array.from(container.querySelectorAll('button'));
        expect(buttons[buttons.length - 1]).toBe(send);
    });

    it.each([
        ['Quote', 'blockquote'],
        ['Code block (⌘⇧⌥C)', 'code'],
    ])('turns the line into a block with %s, and back', async (label, tag) => {
        const container = await mount();
        const input = container.querySelector('[data-composer-input]') as HTMLElement;
        const button = screen.getByRole('button', { name: label });

        await act(async () => fireEvent.click(button));
        await settle();
        expect(input.querySelector(tag)).not.toBeNull();
        expect(button.getAttribute('aria-pressed')).toBe('true');

        await act(async () => fireEvent.click(button));
        await settle();
        expect(input.querySelector(tag)).toBeNull();
    });

    const addLink = async (fields: { text?: string; link: string }) => {
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link' })));
        const dialog = await screen.findByRole('dialog', { name: 'Add link' });
        if (fields.text !== undefined) {
            const text = screen.getByRole('textbox', { name: 'Text' });
            await act(async () => fireEvent.change(text, { target: { value: fields.text } }));
        }
        const link = screen.getByRole('textbox', { name: 'Link' });
        await act(async () => fireEvent.change(link, { target: { value: fields.link } }));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
        await settle();
        return dialog;
    };

    it('inserts the text as a link to the address, Slack-style, and sends it labelled', async () => {
        const container = await mount();
        const input = container.querySelector('[data-composer-input]') as HTMLElement;

        await addLink({ text: 'the docs', link: 'example.com/a' });

        const link = input.querySelector('a');
        expect(link?.textContent).toBe('the docs');
        expect(link?.getAttribute('href')).toBe('https://example.com/a');
        expect(useComposerDraftStore.getState().drafts.L1).toBe('[the docs](https://example.com/a)');
        expect(screen.queryByRole('dialog', { name: 'Add link' })).toBeNull();
    });

    it('inserts the bare address when no text is given', async () => {
        await mount();

        await addLink({ link: 'example.com/a' });

        expect(useComposerDraftStore.getState().drafts.L1).toBe('https://example.com/a');
    });

    it('keeps Save off until the address can be a link', async () => {
        await mount();

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link' })));
        const link = await screen.findByRole('textbox', { name: 'Link' });
        await act(async () => fireEvent.change(link, { target: { value: 'not a link' } }));

        expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
