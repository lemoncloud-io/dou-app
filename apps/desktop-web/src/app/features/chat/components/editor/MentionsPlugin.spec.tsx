import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

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
    KEY_SPACE_COMMAND,
    type LexicalEditor,
    type TextNode,
} from 'lexical';

import '../../../../../i18n';

import { COMPOSER_NODES, COMPOSER_THEME } from './editorConfig';
import { $createMentionNode } from './MentionNode';
import type { Mentionable } from '../MentionAutocomplete';
import { MentionsPlugin } from './MentionsPlugin';
import { $collectMention } from './wireMarkdown';

const mountEditor = (mentionables: Mentionable[] = []): LexicalEditor => {
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
            <MentionsPlugin mentionables={mentionables} />
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

describe('MentionsPlugin pick', () => {
    // jsdom lays nothing out: it has no Range rect (the list is anchored at the caret's) and no
    // scrollIntoView (the list keeps its active row in view).
    const rangeRect = Range.prototype.getBoundingClientRect;
    const scrollIntoView = Element.prototype.scrollIntoView;
    beforeAll(() => {
        Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
        Element.prototype.scrollIntoView = () => undefined;
    });
    afterAll(() => {
        Range.prototype.getBoundingClientRect = rangeRect;
        Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(cleanup);

    // The list shows a name, and names repeat and change; the id is what the server is told.
    it("puts the picked member's id on the chip", async () => {
        const editor = mountEditor([
            { id: 'u-ada', name: 'Ada' },
            { id: 'u-bo', name: 'Bo' },
        ]);
        await act(async () =>
            editor.update(
                () => {
                    const text = $createTextNode('hi @Ad');
                    $getRoot().clear().append($createParagraphNode().append(text));
                    text.select(6, 6);
                },
                { discrete: true }
            )
        );
        const option = await screen.findByRole('option', { name: /Ada/ });

        await act(async () => {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
            option.click();
        });

        expect(editor.read(() => $getRoot().getTextContent())).toBe('hi @Ada ');
        expect(editor.read(() => $collectMention())).toEqual({ userIds: ['u-ada'] });
    });

    const EVERYONE: Mentionable = { id: '@everyone', name: 'all', everyone: true, keywords: ['Everyone'] };

    const typeAt = (editor: LexicalEditor, typed: string) =>
        act(async () =>
            editor.update(
                () => {
                    const text = $createTextNode(typed);
                    $getRoot().clear().append($createParagraphNode().append(text));
                    text.select(typed.length, typed.length);
                },
                { discrete: true }
            )
        );

    const pickOption = (option: HTMLElement) =>
        act(async () => {
            option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        });

    it('writes the everyone word and calls everyone when that row is picked', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-ada', name: 'Ada' }]);
        await typeAt(editor, '@');
        const [first] = await screen.findAllByRole('option');

        await pickOption(first);

        expect(editor.read(() => $getRoot().getTextContent())).toBe('@all ');
        expect(editor.read(() => $collectMention())).toEqual({ all: true });
    });

    it('opens with the everyone row first', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@');

        const options = await screen.findAllByRole('option');

        expect(options.map(option => option.textContent)).toEqual([expect.stringContaining('Everyone'), 'AAlice']);
    });

    // Enter picks the first row. "@al" is someone typing Alice; with the everyone row first, that
    // Enter wrote "@all" and called the whole channel instead.
    it('lists a member the typed letters match before the everyone row', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }, { id: 'u-bo', name: 'Bo' }]);
        await typeAt(editor, '@al');

        const options = await screen.findAllByRole('option');

        expect(options.map(option => option.textContent)).toEqual(['AAlice', expect.stringContaining('Everyone')]);
    });

    // "on" is inside "Everyone" and "l" is inside "all": letters from the middle of the row's own
    // words are someone's name being typed, not a search for this row.
    it.each(['@on', '@ll'])('does not offer the everyone row for %s', async typed => {
        const editor = mountEditor([EVERYONE, { id: 'u-bo', name: 'Bolla Jon' }]);
        await typeAt(editor, typed);

        const options = await screen.findAllByRole('option');

        expect(options.map(option => option.textContent)).toEqual(['BBolla Jon']);
    });

    // The row is titled "Everyone" while the word it writes is "all"; either finds it.
    it.each(['@Every', '@al'])('finds the everyone row by %s', async typed => {
        const editor = mountEditor([EVERYONE, { id: 'u-bo', name: 'Bo' }]);
        await typeAt(editor, typed);

        const options = await screen.findAllByRole('option');

        expect(options).toHaveLength(1);
        expect(options[0].textContent).toContain('Everyone');
    });
});

describe('MentionsPlugin default row, semantics and dismissal', () => {
    const rangeRect = Range.prototype.getBoundingClientRect;
    const scrollIntoView = Element.prototype.scrollIntoView;
    beforeAll(() => {
        Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
        Element.prototype.scrollIntoView = () => undefined;
    });
    afterAll(() => {
        Range.prototype.getBoundingClientRect = rangeRect;
        Element.prototype.scrollIntoView = scrollIntoView;
    });
    afterEach(cleanup);

    const EVERYONE: Mentionable = { id: '@everyone', name: 'all', everyone: true, keywords: ['Everyone'] };

    const typeAt = (editor: LexicalEditor, typed: string) =>
        act(async () =>
            editor.update(
                () => {
                    const text = $createTextNode(typed);
                    $getRoot().clear().append($createParagraphNode().append(text));
                    text.select(typed.length, typed.length);
                },
                { discrete: true }
            )
        );

    const selected = (options: HTMLElement[]) =>
        options.map(option => option.getAttribute('aria-selected'));

    // A bare @ is someone about to name a person; Enter calling the whole channel is the costlier mistake.
    it('highlights the first person, not everyone, on a bare @', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@');

        expect(selected(await screen.findAllByRole('option'))).toEqual(['false', 'true']);
    });

    it('keeps everyone first in the order on a bare @', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@');

        const options = await screen.findAllByRole('option');
        expect(options[0].textContent).toContain('Everyone');
    });

    it('highlights the first row once letters are typed', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@ali');

        expect(selected(await screen.findAllByRole('option'))).toEqual(['true']);
    });

    it('exposes the open list as a labelled combobox with a result count', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@');

        const box = screen.getByRole('combobox');
        expect(box.getAttribute('aria-expanded')).toBe('true');
        const listbox = screen.getByRole('listbox', { name: 'Mention suggestions' });
        expect(box.getAttribute('aria-controls')).toBe(listbox.id);
        expect(box.getAttribute('aria-activedescendant')).toBe(
            screen.getAllByRole('option')[1].id
        );
        expect(screen.getByText('2 mention suggestions')).toBeTruthy();
    });

    it('closes the list when focus leaves the composer', async () => {
        const editor = mountEditor([EVERYONE, { id: 'u-alice', name: 'Alice' }]);
        await typeAt(editor, '@');
        await screen.findAllByRole('option');

        const root = editor.getRootElement();
        if (!root) throw new Error('editor root missing');
        act(() => {
            root.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
        });

        expect(screen.queryAllByRole('option')).toHaveLength(0);
    });
});

describe('clampMenuAnchor', () => {
    it('clamps a right-edge caret into the viewport and flips below a top-edge caret', async () => {
        const { clampMenuAnchor } = await import('./MentionsPlugin');
        expect(clampMenuAnchor({ left: 2000, top: 100 }, 1024, 768)).toEqual({
            left: 1024 - 256 - 8,
            below: true,
        });
        expect(clampMenuAnchor({ left: 100, top: 700 }, 1024, 768)).toEqual({ left: 100, below: false });
        expect(clampMenuAnchor({ left: 2, top: 700 }, 1024, 768)).toEqual({ left: 8, below: false });
    });
});
