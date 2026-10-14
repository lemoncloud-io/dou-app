import { afterEach, describe, expect, it } from 'vitest';

import { act, cleanup, render, screen } from '@testing-library/react';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    type LexicalEditor,
    type TextNode,
} from 'lexical';

import '../../../../../i18n';

import { COMPOSER_NODES, COMPOSER_THEME } from './editorConfig';
import { $createMentionNode } from './MentionNode';
import type { Mentionable } from '../MentionAutocomplete';
import { useUnpickedMention } from './useUnpickedMention';

const mountProbe = (mentionables: Mentionable[]): LexicalEditor => {
    let captured: LexicalEditor | undefined;
    const Capture = () => {
        [captured] = useLexicalComposerContext();
        return null;
    };
    const Probe = () => {
        const [editor] = useLexicalComposerContext();
        const match = useUnpickedMention(editor, mentionables);
        return <span data-testid="unpicked">{match ? match.name : ''}</span>;
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
            <Probe />
            <Capture />
        </LexicalComposer>
    );
    if (!captured) throw new Error('editor not mounted');
    return captured;
};

const typeText = (editor: LexicalEditor, typed: string, caret?: number) =>
    act(async () =>
        editor.update(
            () => {
                const text = $createTextNode(typed);
                $getRoot().clear().append($createParagraphNode().append(text));
                text.select(caret ?? typed.length, caret ?? typed.length);
            },
            { discrete: true }
        )
    );

const ROSTER: Mentionable[] = [
    { id: 'u-ada', name: 'Ada' },
    { id: '@everyone', name: 'all', everyone: true, keywords: ['Everyone'] },
];

describe('useUnpickedMention', () => {
    afterEach(cleanup);

    const hint = () => screen.getByTestId('unpicked').textContent;

    // Typed the full name, moved on, never picked: sending now mentions nobody.
    it('names a member typed in full but never picked', async () => {
        const editor = mountProbe(ROSTER);
        await typeText(editor, 'hi @Ada, welcome');

        expect(hint()).toBe('Ada');
    });

    it('stays quiet while the name is still being picked', async () => {
        const editor = mountProbe(ROSTER);
        await typeText(editor, 'hi @Ad');

        expect(hint()).toBe('');
    });

    it('stays quiet once the name is picked', async () => {
        const editor = mountProbe(ROSTER);
        await act(async () =>
            editor.update(
                () => {
                    const text: TextNode = $createTextNode(' hi');
                    $getRoot()
                        .clear()
                        .append($createParagraphNode().append($createMentionNode('@Ada', { userId: 'u-ada' }), text));
                    text.select(3, 3);
                },
                { discrete: true }
            )
        );

        expect(hint()).toBe('');
    });

    it('names the everyone word typed without picking', async () => {
        const editor = mountProbe(ROSTER);
        await typeText(editor, 'hi @all, welcome');

        expect(hint()).toBe('all');
    });

    it('stays quiet when no typed word matches the roster', async () => {
        const editor = mountProbe(ROSTER);
        await typeText(editor, 'mail me at lemon@lemoncloud.io');

        expect(hint()).toBe('');
    });
});
