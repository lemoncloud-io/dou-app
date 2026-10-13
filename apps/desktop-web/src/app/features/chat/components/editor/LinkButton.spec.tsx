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

describe('normalizeLinkAddress', () => {
    it.each([
        ['example.com', 'https://example.com'],
        ['  example.com/a?b=1  ', 'https://example.com/a?b=1'],
        ['http://example.com', 'http://example.com'],
        ['https://example.com', 'https://example.com'],
        ['localhost:3000/x', 'https://localhost:3000/x'],
        ['example.com:8080', 'https://example.com:8080'],
    ])('reads %j as %j', (raw, url) => {
        expect(normalizeLinkAddress(raw)).toBe(url);
    });

    it.each(['', '   ', 'not a link', 'javascript://alert(1)', 'ftp://example.com'])('refuses %j', raw => {
        expect(normalizeLinkAddress(raw)).toBeNull();
    });
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

    const addLink = async (address: string) => {
        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Link' })));
        const field = await screen.findByRole('textbox', { name: 'Link address' });
        await act(async () => fireEvent.change(field, { target: { value: address } }));
        await act(async () => fireEvent.submit(field));
    };

    it('puts the link after the selected words instead of replacing them', async () => {
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

        await addLink('example.com');

        expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('see docs https://example.com ');
    });
});
