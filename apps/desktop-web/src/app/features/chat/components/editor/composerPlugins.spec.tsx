import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render } from '@testing-library/react';

import { $createCodeNode } from '@lexical/code-core';
import { $isAutoLinkNode } from '@lexical/link';
import { $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    type ElementNode,
    type LexicalEditor,
    type TextFormatType,
} from 'lexical';

import { ComposerAutoLinkPlugin } from './composerPlugins';
import { COMPOSER_NODES, COMPOSER_THEME, COMPOSER_TRANSFORMERS } from './editorConfig';

const mountEditor = (): LexicalEditor => {
    let captured: LexicalEditor | undefined;
    const Capture = () => {
        [captured] = useLexicalComposerContext();
        return null;
    };
    render(
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
            <ComposerAutoLinkPlugin />
            <Capture />
        </LexicalComposer>
    );
    if (!captured) throw new Error('editor not mounted');
    return captured;
};

// act(): the update re-renders the RichTextPlugin placeholder.
const typeInto = (
    editor: LexicalEditor,
    text: string,
    block: () => ElementNode = $createParagraphNode,
    format?: TextFormatType
) =>
    act(() =>
        editor.update(
            () => {
                const root = $getRoot();
                root.clear();
                const node = $createTextNode(text);
                if (format) node.toggleFormat(format);
                root.append(block().append(node));
            },
            { discrete: true }
        )
    );

const linkUrls = (editor: LexicalEditor): string[] =>
    editor.getEditorState().read(() =>
        $getRoot()
            .getAllTextNodes()
            .map(node => node.getParent())
            .filter($isAutoLinkNode)
            .filter(link => !link.getIsUnlinked())
            .map(link => link.getURL())
    );

describe('ComposerAutoLinkPlugin', () => {
    it('marks a URL in the composer as a link', () => {
        const editor = mountEditor();
        typeInto(editor, '@lane https://github.com/lemoncloud-io/dou-app/pull/505 please review');

        expect(linkUrls(editor)).toEqual(['https://github.com/lemoncloud-io/dou-app/pull/505']);
    });

    it('sends the URL as the same plain text it was typed as', () => {
        const editor = mountEditor();
        const text = 'see https://example.com/a?b=1 now';
        typeInto(editor, text);

        const markdown = editor
            .getEditorState()
            .read(() => $convertToMarkdownString(COMPOSER_TRANSFORMERS, undefined, true));
        expect(markdown).toBe(text);
    });

    it('does not link text the message view would not link', () => {
        const editor = mountEditor();
        typeInto(editor, 'www.example.com and example.com');

        expect(linkUrls(editor)).toEqual([]);
    });

    it('leaves URLs inside a code block alone', () => {
        const editor = mountEditor();
        typeInto(editor, 'curl https://example.com', () => $createCodeNode());

        expect(linkUrls(editor)).toEqual([]);
    });

    it('leaves URLs inside inline code alone', () => {
        const editor = mountEditor();
        typeInto(editor, 'https://example.com', $createParagraphNode, 'code');

        expect(linkUrls(editor)).toEqual([]);
    });

    it('does not paint an inline-code URL as a link', () => {
        const editor = mountEditor();
        typeInto(editor, 'https://example.com', $createParagraphNode, 'code');

        expect(editor.getRootElement()?.querySelector('.composer-link')).toBeNull();
    });

    describe('clicking a link', () => {
        afterEach(() => vi.restoreAllMocks());

        it('opens the URL in a new window, like Slack', () => {
            const open = vi.spyOn(window, 'open').mockReturnValue(null);
            const editor = mountEditor();
            typeInto(editor, 'see https://example.com/a now');

            const link = editor.getRootElement()?.querySelector('.composer-link');
            if (!link) throw new Error('link not rendered');
            fireEvent.click(link);

            expect(open).toHaveBeenCalledWith('https://example.com/a', '_blank', 'noopener,noreferrer');
        });

        it('does nothing for a URL in inline code, which is not a link', () => {
            const open = vi.spyOn(window, 'open').mockReturnValue(null);
            const editor = mountEditor();
            typeInto(editor, 'https://example.com', $createParagraphNode, 'code');

            const span = editor.getRootElement()?.querySelector('p span');
            if (!span) throw new Error('text not rendered');
            fireEvent.click(span);

            expect(open).not.toHaveBeenCalled();
        });
    });
});
