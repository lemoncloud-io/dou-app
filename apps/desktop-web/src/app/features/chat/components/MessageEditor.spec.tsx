import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { $getRoot, $isRangeSelection, $getSelection, type LexicalEditor } from 'lexical';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../i18n';

import { $exportWireMarkdown, $isMentionNode } from './editor';
import { MessageEditor } from './MessageEditor';

const wrapper = ({ children }: { children: ReactNode }) => <TooltipProvider>{children}</TooltipProvider>;

// jsdom implements no layout, so no scrollIntoView; the editor calls it once when it opens.
Element.prototype.scrollIntoView = vi.fn();
// Nor does it lay out ranges: Lexical scrolls a focused selection into view through one.
Range.prototype.getBoundingClientRect = () => new DOMRect();
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;

type LexicalRoot = HTMLElement & { __lexicalEditor?: LexicalEditor };

const body = (): LexicalRoot => screen.getByRole('textbox', { name: 'Edit message' });
const editorOf = (): LexicalEditor => {
    const editor = body().__lexicalEditor;
    if (!editor) throw new Error('editor not mounted');
    return editor;
};
const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
const cancelButton = () => screen.getByRole('button', { name: 'Cancel' });

// Async act: the toolbar's listener sets state in a microtask after the update.
const typeAtEnd = (text: string) =>
    act(async () => {
        editorOf().update(
            () => {
                $getRoot().selectEnd();
                const selection = $getSelection();
                if ($isRangeSelection(selection)) selection.insertText(text);
            },
            { discrete: true }
        );
    });
const clearAll = () =>
    act(async () => {
        editorOf().update(
            () => {
                $getRoot().clear();
            },
            { discrete: true }
        );
    });
const exported = () => editorOf().getEditorState().read($exportWireMarkdown);

// Lexical reads `keyCode`, not `key`, to recognise Enter.
const pressEnter = (init: KeyboardEventInit = {}) =>
    act(async () => {
        fireEvent.keyDown(body(), { key: 'Enter', keyCode: 13, ...init });
    });

const open = async (initialContent: string, overrides: Partial<Parameters<typeof MessageEditor>[0]> = {}) => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(<MessageEditor initialContent={initialContent} onSave={onSave} onCancel={onCancel} {...overrides} />, {
        wrapper,
    });
    // The document is loaded in a microtask; acting before it lands would see an empty editor.
    await act(async () => {
        await Promise.resolve();
    });
    return { onSave, onCancel };
};

const ADA = { id: 'u-ada', name: 'Ada' };
const BOB = { id: 'u-bob', name: 'Bob' };

describe('MessageEditor', () => {
    afterEach(cleanup);
    beforeEach(() => vi.clearAllMocks());

    it('opens with the message formatted and focus in the body', async () => {
        await open('**bold** and plain');

        await waitFor(() => expect(body().querySelector('.font-semibold')?.textContent).toBe('bold'));
        await waitFor(() => expect(document.activeElement).toBe(body()));
        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    });

    it('has the same four format buttons as the composer', async () => {
        await open('hello');

        const labels = screen
            .getByRole('toolbar', { name: 'Formatting' })
            .querySelectorAll('button')
            .values()
            .map(button => button.getAttribute('aria-label'))
            .toArray();
        expect(labels).toEqual(['Bold (⌘B)', 'Italic (⌘I)', 'Strikethrough (⌘⇧X)', 'Code (⌘⇧C)']);
    });

    it('puts Cancel then Save at the end of the bottom row, with no attach button', async () => {
        await open('hello');

        const buttons = screen
            .getAllByRole('button')
            .map(button => button.getAttribute('aria-label') ?? button.textContent);
        expect(buttons.slice(-2)).toEqual(['Cancel', 'Save']);
        expect(buttons).toContain('Emoji');
        expect(screen.queryByRole('button', { name: /attach|add file|add image/i })).toBeNull();
    });

    it('does not cap the editor at the reading measure', async () => {
        const { onSave } = await open('hello');

        expect(onSave).not.toHaveBeenCalled();
        expect(body().closest('.max-w-prose')).toBeNull();
    });

    it('keeps Save disabled until the text changes', async () => {
        await open('hello');
        expect(saveButton().disabled).toBe(true);

        await typeAtEnd('!');

        expect(saveButton().disabled).toBe(false);
    });

    it('cancels instead of saving when Enter is pressed on an untouched message', async () => {
        const { onSave, onCancel } = await open('hello');

        await pressEnter();

        expect(onSave).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('disables Save and writes nothing when everything is deleted', async () => {
        const { onSave } = await open('hello');

        await clearAll();
        expect(saveButton().disabled).toBe(true);
        await pressEnter();

        expect(onSave).not.toHaveBeenCalled();
    });

    it('saves the wire string of a one-letter edit with the other marks intact', async () => {
        const { onSave, onCancel } = await open('**bold** and snake_case');

        await typeAtEnd('s');
        await pressEnter();

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith('**bold** and snake_cases');
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('saves from the Save button with the same string as Enter', async () => {
        const { onSave } = await open('hello');

        await typeAtEnd('!');
        fireEvent.click(saveButton());

        expect(onSave).toHaveBeenCalledWith('hello!');
    });

    it('breaks the line on Shift+Enter instead of saving', async () => {
        const { onSave } = await open('hello');

        await pressEnter({ shiftKey: true });

        expect(onSave).not.toHaveBeenCalled();
    });

    it('does not save while an IME composition is open', async () => {
        const { onSave } = await open('hello');
        await typeAtEnd('!');

        await pressEnter({ isComposing: true });

        expect(onSave).not.toHaveBeenCalled();
    });

    it('cancels on Escape and marks the key handled so a panel behind it stays open', async () => {
        const { onCancel } = await open('hello');

        const notPrevented = fireEvent.keyDown(body(), { key: 'Escape' });

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(notPrevented).toBe(false);
    });

    it('cancels on Escape from a toolbar button too', async () => {
        const { onCancel } = await open('hello');

        fireEvent.keyDown(screen.getByRole('button', { name: 'Bold (⌘B)' }), { key: 'Escape' });

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('cancels from the Cancel button', async () => {
        const { onCancel } = await open('hello');

        fireEvent.click(cancelButton());

        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('lets Escape close the emoji picker without cancelling the edit', async () => {
        const { onCancel } = await open('hello');

        fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
        const picker = await screen.findByRole('dialog');
        fireEvent.keyDown(picker, { key: 'Escape' });

        expect(onCancel).not.toHaveBeenCalled();
    });

    it('inserts a picked emoji at the caret', async () => {
        await open('hello');

        fireEvent.click(screen.getByRole('button', { name: 'Emoji' }));
        const picker = await screen.findByRole('dialog');
        const emoji = picker.querySelector('button:not([role="tab"])');
        if (!emoji) throw new Error('picker has no emoji');
        const glyph = emoji.textContent ?? '';
        fireEvent.click(emoji);

        await waitFor(() => expect(exported()).toBe(`hello${glyph}`));
        // Radix hands focus back to its trigger on close; the caret has to stay in the text.
        await act(async () => new Promise(resolve => setTimeout(resolve, 50)));
        expect(document.activeElement).toBe(body());
    });

    it('keeps what you typed when the message text changes underneath it', async () => {
        const onSave = vi.fn();
        const onCancel = vi.fn();
        const { rerender } = render(<MessageEditor initialContent="hello" onSave={onSave} onCancel={onCancel} />, {
            wrapper,
        });
        const flush = () =>
            act(async () => {
                await Promise.resolve();
            });
        await flush();
        await typeAtEnd(' world');

        rerender(<MessageEditor initialContent="hello (edited elsewhere)" onSave={onSave} onCancel={onCancel} />);
        // A reload would be committed in a microtask, so look after one.
        await flush();

        expect(exported()).toBe('hello world');
    });

    it('describes the box with the shortcut hint', async () => {
        await open('hello');

        const hint = screen.getByText('Enter to save · Esc to cancel');
        expect(body().getAttribute('aria-describedby')).toBe(hint.id);
    });
    describe('mentions', () => {
        const chips = () =>
            editorOf()
                .getEditorState()
                .read(() =>
                    $getRoot()
                        .getAllTextNodes()
                        .filter($isMentionNode)
                        .map(node => node.getTextContent())
                );

        it('opens a listed @name as a chip and saves the same text after an edit', async () => {
            const { onSave } = await open('hi @Ada there', { mentionables: [ADA, BOB] });

            expect(chips()).toEqual(['@Ada']);
            await typeAtEnd('!');
            await pressEnter();

            expect(onSave).toHaveBeenCalledWith('hi @Ada there!');
        });

        it('offers the roster when @ is typed, and Enter picks instead of saving', async () => {
            const { onSave } = await open('hi ', { mentionables: [ADA, BOB] });

            await typeAtEnd('@A');
            expect(await screen.findByRole('listbox')).toBeDefined();
            await pressEnter();

            expect(onSave).not.toHaveBeenCalled();
            expect(chips()).toEqual(['@Ada']);

            await pressEnter();
            expect(onSave).toHaveBeenCalledWith('hi @Ada');
        });

        it('closes the roster on Escape without cancelling the edit', async () => {
            const { onCancel } = await open('hi ', { mentionables: [ADA] });

            await typeAtEnd('@A');
            await screen.findByRole('listbox');
            fireEvent.keyDown(body(), { key: 'Escape' });

            expect(onCancel).not.toHaveBeenCalled();
        });
    });
});
