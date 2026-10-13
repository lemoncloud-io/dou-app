import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, fireEvent, render } from '@testing-library/react';

import { $createCodeNode, $isCodeNode } from '@lexical/code-core';
import { $isAutoLinkNode } from '@lexical/link';
import { $convertToMarkdownString } from '@lexical/markdown';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    COMMAND_PRIORITY_LOW,
    KEY_ARROW_DOWN_COMMAND,
    PASTE_COMMAND,
    UNDO_COMMAND,
    type ElementNode,
    type LexicalEditor,
    type TextFormatType,
} from 'lexical';

import { CodeFencePastePlugin, CodeFenceShortcutPlugin, ComposerAutoLinkPlugin } from './composerPlugins';
import { COMPOSER_NODES, COMPOSER_THEME, COMPOSER_TRANSFORMERS } from './editorConfig';
import { $createMentionNode } from './MentionNode';
import { $exportWireMarkdown } from './wireMarkdown';

const mountEditor = (plugins: ReactNode = <ComposerAutoLinkPlugin />): LexicalEditor => {
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
            {plugins}
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

/**
 * One keystroke per update, as typing produces them — the shortcut keys on that shape. Async: the
 * shortcut's own update lands on the next microtask, as it does after a real keystroke.
 */
const typeKeys = async (editor: LexicalEditor, keys: string) => {
    for (const key of keys) {
        await act(async () =>
            editor.update(
                () => {
                    const selection = $getSelection();
                    if (!$isRangeSelection(selection)) throw new Error('no caret');
                    if (key === '\n') selection.insertLineBreak();
                    else selection.insertText(key);
                },
                { discrete: true }
            )
        );
    }
};

const startEmpty = (editor: LexicalEditor) =>
    act(() =>
        editor.update(
            () => {
                const root = $getRoot();
                root.clear();
                root.append($createParagraphNode());
                root.selectEnd();
            },
            { discrete: true }
        )
    );

const wire = (editor: LexicalEditor): string => editor.getEditorState().read($exportWireMarkdown);

const blockTypes = (editor: LexicalEditor): string[] =>
    editor.getEditorState().read(() =>
        $getRoot()
            .getChildren()
            .map(node => node.getType())
    );

const caretInCode = (editor: LexicalEditor): boolean =>
    editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && $isCodeNode(selection.anchor.getNode().getTopLevelElement());
    });

describe('CodeFenceShortcutPlugin', () => {
    const mount = () => {
        const editor = mountEditor(
            <>
                <HistoryPlugin />
                <CodeFenceShortcutPlugin />
            </>
        );
        startEmpty(editor);
        return editor;
    };

    it('turns ``` on an empty line into a code block the moment the third backtick lands', async () => {
        const editor = mount();
        await typeKeys(editor, '```');

        expect(blockTypes(editor)).toEqual(['code']);
        expect(caretInCode(editor)).toBe(true);
        await typeKeys(editor, 'ls');
        expect(wire(editor)).toBe('```\nls\n```');
    });

    it('keeps the lines above a fence typed after Shift+Enter as text', async () => {
        const editor = mount();
        await typeKeys(editor, 'run this:\n```');

        expect(blockTypes(editor)).toEqual(['paragraph', 'code']);
        expect(caretInCode(editor)).toBe(true);
        await typeKeys(editor, 'git clone x');
        expect(wire(editor)).toBe('run this:\n```\ngit clone x\n```');
    });

    it('leaves backticks typed after other text on the same line alone', async () => {
        const editor = mount();
        await typeKeys(editor, 'a```');

        expect(blockTypes(editor)).toEqual(['paragraph']);
        expect(wire(editor)).toBe('a```');
    });

    it('leaves backticks typed in front of a mention on the same line alone', async () => {
        const editor = mount();
        act(() =>
            editor.update(
                () => {
                    const paragraph = $createParagraphNode().append($createMentionNode('@alice'));
                    $getRoot().clear().append(paragraph);
                    paragraph.select(0, 0);
                },
                { discrete: true }
            )
        );
        await typeKeys(editor, '```');

        expect(blockTypes(editor)).toEqual(['paragraph']);
    });

    it('brings back the literal backticks on undo', async () => {
        const editor = mount();
        await typeKeys(editor, '```');
        await act(async () => {
            editor.dispatchCommand(UNDO_COMMAND, undefined);
        });

        expect(blockTypes(editor)).toEqual(['paragraph']);
        expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('```');
    });

    it('does not fire on text that arrives in one update, like a loaded draft', async () => {
        const editor = mount();
        typeInto(editor, '```');

        expect(blockTypes(editor)).toEqual(['paragraph']);
    });

    it('leaves a trailing code block on ArrowDown into a new line below it', async () => {
        const editor = mount();
        await typeKeys(editor, '```ls');
        await act(async () => {
            editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        });

        expect(blockTypes(editor)).toEqual(['code', 'paragraph']);
        expect(caretInCode(editor)).toBe(false);
        await typeKeys(editor, 'done');
        expect(wire(editor)).toBe('```\nls\n```\ndone');
    });
});

describe('CodeFencePastePlugin', () => {
    const mount = () => {
        const editor = mountEditor(<CodeFencePastePlugin />);
        startEmpty(editor);
        return editor;
    };

    /**
     * Whether the paste was passed on to the editor's own handler. That handler needs a real
     * clipboard jsdom does not have, so a catcher registered after the plugin stands in for it.
     */
    const paste = async (editor: LexicalEditor, text: string, types = ['text/plain']) => {
        const event = {
            clipboardData: { types, getData: (type: string) => (type === 'text/plain' ? text : '') },
            preventDefault: vi.fn(),
        } as unknown as ClipboardEvent;
        let passedOn = false;
        const unregister = editor.registerCommand(
            PASTE_COMMAND,
            () => {
                passedOn = true;
                return true;
            },
            COMMAND_PRIORITY_LOW
        );
        await act(async () => {
            editor.dispatchCommand(PASTE_COMMAND, event);
        });
        unregister();
        return passedOn;
    };

    it('pastes the fenced part as a code block and the rest as text, and sends the fence once', async () => {
        const editor = mount();
        expect(await paste(editor, 'run:\n```sh\ngit clone x\n```\nthen')).toBe(false);

        expect(blockTypes(editor)).toEqual(['paragraph', 'code', 'paragraph']);
        expect(wire(editor)).toBe('run:\n```sh\ngit clone x\n```\nthen');
    });

    it('keeps a multi-line body as lines of one block and leaves the caret below it', async () => {
        const editor = mount();
        await paste(editor, '```\na\nb\n```');

        expect(blockTypes(editor)).toEqual(['code', 'paragraph']);
        expect(caretInCode(editor)).toBe(false);
        expect(wire(editor).trim()).toBe('```\na\nb\n```');
    });

    it('leaves text with no fence to the editor', async () => {
        const editor = mount();
        expect(await paste(editor, 'just `code` and text')).toBe(true);
        expect(blockTypes(editor)).toEqual(['paragraph']);
    });

    it('leaves a copy that carries HTML to the editor', async () => {
        const editor = mount();
        expect(await paste(editor, '```\nx\n```', ['text/plain', 'text/html'])).toBe(true);
        expect(blockTypes(editor)).toEqual(['paragraph']);
    });

    it('leaves a paste inside a code block raw', async () => {
        const editor = mountEditor(
            <>
                <CodeFenceShortcutPlugin />
                <CodeFencePastePlugin />
            </>
        );
        startEmpty(editor);
        await typeKeys(editor, '```');
        expect(await paste(editor, '```\nx\n```')).toBe(true);
        expect(blockTypes(editor)).toEqual(['code']);
    });
});
