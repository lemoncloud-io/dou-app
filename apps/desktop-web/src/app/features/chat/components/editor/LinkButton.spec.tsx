import { afterEach, describe, expect, it } from 'vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';

import { TooltipProvider } from '@chatic/ui-kit/components/ui/tooltip';

import '../../../../../i18n';
import { COMPOSER_NODES, COMPOSER_THEME } from './editorConfig';
import { LinkButton, normalizeLinkAddress } from './LinkButton';
import { $exportWireMarkdown, $importWireMarkdown } from './wireMarkdown';

describe('normalizeLinkAddress', () => {
    it.each([
        ['example.com', 'https://example.com'],
        ['  example.com/a?b=1  ', 'https://example.com/a?b=1'],
        ['http://example.com', 'http://example.com'],
        ['https://example.com', 'https://example.com'],
        ['localhost:3000/x', 'https://localhost:3000/x'],
        ['example.com:8080', 'https://example.com:8080'],
        ['en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_%28bar%29'],
    ])('reads %j as %j', (raw, url) => {
        expect(normalizeLinkAddress(raw)).toBe(url);
    });

    it.each(['', '   ', 'not a link', 'javascript://alert(1)', 'ftp://example.com', 'https:///a'])(
        'refuses %j',
        raw => {
            expect(normalizeLinkAddress(raw)).toBeNull();
        }
    );
});

describe('LinkButton', () => {
    afterEach(cleanup);

    const mount = (): LexicalEditor => {
        let captured: LexicalEditor | undefined;
        const Capture = () => {
            [captured] = useLexicalComposerContext();
            return null;
        };
        render(
            <TooltipProvider>
                <LexicalComposer
                    initialConfig={{
                        namespace: 'test',
                        theme: COMPOSER_THEME,
                        nodes: COMPOSER_NODES,
                        onError: error => {
                            throw error;
                        },
                    }}
                >
                    <RichTextPlugin contentEditable={<ContentEditable />} ErrorBoundary={LexicalErrorBoundary} />
                    <LinkButton className="" />
                    <Capture />
                </LexicalComposer>
            </TooltipProvider>
        );
        if (!captured) throw new Error('editor not mounted');
        return captured;
    };

    const wire = (editor: LexicalEditor) => editor.getEditorState().read($exportWireMarkdown);

    const openDialog = async () => {
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link' })));
        await screen.findByRole('dialog', { name: 'Add link' });
        return {
            text: screen.getByRole('textbox', { name: 'Text' }) as HTMLInputElement,
            link: screen.getByRole('textbox', { name: 'Link' }) as HTMLInputElement,
        };
    };

    const save = async () => {
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    };

    it('starts the text from the selected words and turns them into the link', async () => {
        const editor = mount();
        await act(async () =>
            editor.update(
                () => {
                    const text = $createTextNode('see docs');
                    $getRoot().clear().append($createParagraphNode().append(text));
                    text.select(4, 8);
                },
                { discrete: true }
            )
        );

        const { text, link } = await openDialog();
        expect(text.value).toBe('docs');
        await act(async () => fireEvent.change(link, { target: { value: 'example.com' } }));
        await save();

        expect(wire(editor)).toBe('see [docs](https://example.com)');
    });

    it('turns brackets in the text into parentheses, which a message can carry', async () => {
        const editor = mount();
        const { text, link } = await openDialog();
        await act(async () => fireEvent.change(text, { target: { value: 'see [1]' } }));
        await act(async () => fireEvent.change(link, { target: { value: 'example.com' } }));
        await save();

        expect(wire(editor)).toBe('[see (1)](https://example.com)');
    });

    it('edits the link the caret is in', async () => {
        const editor = mount();
        await act(async () =>
            editor.update(
                () => {
                    $importWireMarkdown('see [docs](https://old.example.com) now');
                    $getRoot().getFirstDescendant()?.getNextSibling()?.selectEnd();
                },
                { discrete: true }
            )
        );

        const { text, link } = await openDialog();
        expect(text.value).toBe('docs');
        expect(link.value).toBe('https://old.example.com');
        await act(async () => fireEvent.change(text, { target: { value: 'new docs' } }));
        await act(async () => fireEvent.change(link, { target: { value: 'https://new.example.com' } }));
        await save();

        expect(wire(editor)).toBe('see [new docs](https://new.example.com) now');
    });

    it('leaves the text alone on Cancel', async () => {
        const editor = mount();
        await act(async () =>
            editor.update(
                () => {
                    const text = $createTextNode('see docs');
                    $getRoot().clear().append($createParagraphNode().append(text));
                    text.select(4, 8);
                },
                { discrete: true }
            )
        );

        const { link } = await openDialog();
        await act(async () => fireEvent.change(link, { target: { value: 'example.com' } }));
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));

        expect(wire(editor)).toBe('see docs');
    });
});
