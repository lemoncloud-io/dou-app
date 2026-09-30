import { afterEach, describe, expect, it } from 'vitest';

import { act, cleanup, render } from '@testing-library/react';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    KEY_SPACE_COMMAND,
    type LexicalEditor,
    type TextNode,
} from 'lexical';

import { COMPOSER_NODES, COMPOSER_THEME } from './editorConfig';
import { $createMentionNode } from './MentionNode';
import { MentionsPlugin } from './MentionsPlugin';

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
            <MentionsPlugin mentionables={[]} />
            <Capture />
        </LexicalComposer>
    );
    if (!captured) throw new Error('editor not mounted');
    return captured;
};

// A chip followed by `after`, with the caret `caret` characters into that text — the state a
// pick leaves behind is `after = ' '`, `caret = 1`.
const placeAfterMention = (editor: LexicalEditor, after: string, caret: number) =>
    act(() =>
        editor.update(
            () => {
                const root = $getRoot();
                root.clear();
                const text: TextNode = $createTextNode(after);
                root.append($createParagraphNode().append($createMentionNode('@Ada'), text));
                text.select(caret, caret);
            },
            { discrete: true }
        )
    );

const pressSpace = (editor: LexicalEditor) => {
    const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });
    let handled = false;
    act(() => {
        editor.update(() => {
            handled = editor.dispatchCommand(KEY_SPACE_COMMAND, event);
        });
    });
    return { handled, prevented: event.defaultPrevented };
};

describe('MentionsPlugin space after a picked mention', () => {
    afterEach(cleanup);

    // A pick inserts "@Ada " and the caret after it; the space typed next out of habit
    // doubled it to "@Ada  hello".
    it('drops a space typed right after the one a pick inserted', () => {
        const editor = mountEditor();
        placeAfterMention(editor, ' ', 1);

        expect(pressSpace(editor)).toEqual({ handled: true, prevented: true });
    });

    it('leaves a space alone once something follows the chip', () => {
        const editor = mountEditor();
        placeAfterMention(editor, ' hi', 3);

        expect(pressSpace(editor)).toEqual({ handled: false, prevented: false });
    });

    it('leaves a space alone when no chip precedes it', () => {
        const editor = mountEditor();
        act(() =>
            editor.update(
                () => {
                    const text = $createTextNode(' ');
                    $getRoot()
                        .clear()
                        .append($createParagraphNode().append($createTextNode('hi'), text));
                    text.select(1, 1);
                },
                { discrete: true }
            )
        );

        expect(pressSpace(editor).prevented).toBe(false);
    });
});
