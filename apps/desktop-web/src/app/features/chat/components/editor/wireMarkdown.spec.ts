import { describe, expect, it } from 'vitest';

import { $createLinkNode, $isLinkNode } from '@lexical/link';
import { $dfs } from '@lexical/utils';

import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    createEditor,
    type LexicalEditor,
    type TextNode,
} from 'lexical';

import { COMPOSER_NODES } from './editorConfig';
import { $createMentionNode, $isMentionNode } from './MentionNode';
import { $collectMention, $exportWireMarkdown, $importWireMarkdown } from './wireMarkdown';

const makeEditor = (): LexicalEditor =>
    createEditor({
        namespace: 'wire-markdown-spec',
        nodes: COMPOSER_NODES,
        onError: error => {
            throw error;
        },
    });

const roundTrip = (wire: string): string => {
    const editor = makeEditor();
    editor.update(() => $importWireMarkdown(wire), { discrete: true });
    return editor.read(() => $exportWireMarkdown());
};

// The wire has no escape syntax: RichText prints a backslash as a backslash. Lexical's markdown
// import strips `\` + punctuation and its export adds `\` before `* _ ` ~`, so each row here is
// a string that would come back different through the vendor functions alone.
describe('wire markdown round trip', () => {
    const fence = (body: string, lang = '') => '```' + lang + '\n' + body + '\n```';

    it.each([
        ['plain text', 'plain'],
        ['every format', '**b** *i* ~~s~~ `c`'],
        ['a line break', 'line1\nline2'],
        ['blank lines', 'a\n\n\n\nb'],
        ['a fenced block', fence('const a = 1;')],
        ['a fenced block with a language', fence('const a = 1;', 'ts')],
        ['asterisks and underscores in a fence', fence('a \\* b\nsnake_case *x*', 'js')],
        ['a quote', '> quote'],
        ['list markers, which are plain text here', '- item'],
        ['heading markers, which are plain text here', '# heading'],
        ['an underscore word', 'snake_case_name'],
        ['spaced asterisks', 'a * b * c'],
        ['dunder', '__init__.py'],
        ['single tildes', '~single~'],
        ['a url with markup characters', 'https://example.com/a_b?c=*d'],
        ['a labelled link', 'see [the docs](https://example.com/a_b) here'],
        ['bracket text that is not a link', '[x] done (see notes)'],
        ['bracket text before a link', '[x] done [y](https://a.example)'],
        ['a labelled link to a non-http address', '[x](javascript:alert(1))'],
        ['a labelled link with no host', '[x](https:///a)'],
        ['a mention-shaped word with an underscore', '@snake_name hi'],
        ['an underscore inside bold', '**bold_x**'],
        ['two backslashes', 'a\\\\b'],
        ['a UNC path', '\\\\server\\share'],
        ['a backslash before an underscore', 'a\\_b'],
        ['a backslash before a backtick', 'back\\`tick'],
        ['a backslash before punctuation', 'wow\\! (a\\b)'],
        ['a trailing backslash', 'path\\'],
        ['backslashes inside strike', '~~a\\\\b~~'],
        ['backslash punctuation inside bold', '**wow\\!**'],
        ['a UNC path inside bold', '**\\\\server\\share**'],
        ['backslashes between two inline code spans', 'x `c` \\\\srv `d`'],
        ['a literal character reference', '&#65; and &amp;'],
        ['underscore emphasis, which this dialect does not render', '_x_'],
        ['inline code beside an underscore word', '`code` out_side'],
        ['a backslash and an asterisk inside inline code', '`re\\*x` out_side'],
        ['backslashes inside inline code', '`a\\\\b \\! c\\`'],
        ['a character reference inside inline code', '`&#65;`'],
        ['emoji and Korean', '안녕 😀 **굵게** snake_case'],
    ])('keeps %s as typed', (_name, wire) => {
        expect(roundTrip(wire)).toBe(wire);
    });
});

describe('wire markdown import', () => {
    // A one-line fence is rewritten as a block; the lines after it must not lose their backslashes.
    it('keeps backslashes on the lines after a one-line fence', () => {
        expect(roundTrip('```x```\na\\\\b')).toBe('```\nx\n```\na\\\\b');
    });
});

describe('wire markdown mentions', () => {
    const chipsIn = (wire: string, names: string[]) => {
        const editor = makeEditor();
        editor.update(() => $importWireMarkdown(wire, names), { discrete: true });
        return {
            chips: editor.read(() =>
                $getRoot()
                    .getAllTextNodes()
                    .filter($isMentionNode)
                    .map(node => node.getTextContent())
            ),
            wire: editor.read(() => $exportWireMarkdown()),
        };
    };

    it('turns a listed name into one chip and writes it back as the same text', () => {
        expect(chipsIn('hi @Ada there', ['Ada'])).toEqual({ chips: ['@Ada'], wire: 'hi @Ada there' });
    });

    it('turns every occurrence into a chip', () => {
        expect(chipsIn('@Ada and @Bo, @Ada', ['Ada', 'Bo'])).toEqual({
            chips: ['@Ada', '@Bo', '@Ada'],
            wire: '@Ada and @Bo, @Ada',
        });
    });

    it('prefers the longest listed name', () => {
        expect(chipsIn('@Ada Lovelace hi', ['Ada', 'Ada Lovelace']).chips).toEqual(['@Ada Lovelace']);
    });

    it('treats a name as text, not a pattern', () => {
        expect(chipsIn('hello @A.d(a) there', ['A.d(a)']).chips).toEqual(['@A.d(a)']);
        expect(chipsIn('hello @AXd(a) there', ['A.d(a)']).chips).toEqual([]);
    });

    it('turns the group tokens into chips whenever names are given', () => {
        expect(chipsIn('@channel heads up', []).chips).toEqual(['@channel']);
    });

    it('keeps the chip inside a bold run', () => {
        expect(chipsIn('**@Ada**', ['Ada'])).toEqual({ chips: ['@Ada'], wire: '**@Ada**' });
    });

    it.each([
        ['a name that is not listed', '@nobody hi', ['Ada']],
        ['a longer name that starts with a listed one', '@Adalyn hi', ['Ada']],
        ['a name that is not at a word start', 'https://medium.com/@Ada', ['Ada']],
        ['a name followed by a token character', '@Ada_x hi', ['Ada']],
        ['a name inside inline code', 'run `@Ada` now', ['Ada']],
        ['a name inside a code block', '```\n@Ada\n```', ['Ada']],
    ])('leaves %s as text', (_name, wire, names) => {
        expect(chipsIn(wire, names)).toEqual({ chips: [], wire: roundTrip(wire) });
    });

    it('makes no chips when no names are given', () => {
        const editor = makeEditor();
        editor.update(() => $importWireMarkdown('hi @Ada @channel'), { discrete: true });
        expect(editor.read(() => $getRoot().getAllTextNodes().filter($isMentionNode).length)).toBe(0);
    });
});

describe('wire markdown export', () => {
    const exportOf = (children: () => TextNode[]): string => {
        const editor = makeEditor();
        editor.update(
            () =>
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append(...children())),
            {
                discrete: true,
            }
        );
        return editor.read(() => $exportWireMarkdown());
    };

    it('writes unformatted markup characters as they are', () => {
        expect(exportOf(() => [$createTextNode('*x* and _y_ and ~z~')])).toBe('*x* and _y_ and ~z~');
    });

    it('keeps spaces around a bold run as spaces, not character references', () => {
        const wire = exportOf(() => [$createTextNode(' word ').toggleFormat('bold')]);
        expect(wire).not.toContain('&#');
        expect(wire.trim()).toBe('**word**');
    });
});

describe('wire markdown labelled links', () => {
    const linkTexts = (wire: string) => {
        const editor = makeEditor();
        editor.update(() => $importWireMarkdown(wire), { discrete: true });
        return editor.getEditorState().read(() =>
            [...$dfs()]
                .map(({ node }) => node)
                .filter($isLinkNode)
                .map(node => node.getTextContent())
        );
    };

    it('links only the words in brackets right before the address', () => {
        expect(linkTexts('[x] done [y](https://a.example)')).toEqual(['y']);
    });

    it('reads a labelled link to anything but an http(s) address as text', () => {
        expect(linkTexts('[x](javascript:alert(1))')).toEqual([]);
        expect(linkTexts('[x](/relative)')).toEqual([]);
    });

    it("writes brackets typed into a link's words as parentheses", () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append(
                        $createParagraphNode().append(
                            $createLinkNode('https://a.example').append($createTextNode('see [1]'))
                        )
                    );
            },
            { discrete: true }
        );
        expect(editor.getEditorState().read($exportWireMarkdown)).toBe('[see (1)](https://a.example)');
    });
});

// The server never reads the body to decide who was mentioned: only a pick from the list counts,
// and a pick is a chip that still carries the member's id when the message is sent.
describe('collected mention', () => {
    const pick = (name: string, userId: string) => $createMentionNode(`@${name}`, { userId });

    const collect = (fill: () => void) => {
        const editor = makeEditor();
        editor.update(fill, { discrete: true });
        return editor.read(() => $collectMention());
    };

    it('carries the id of a picked member', () => {
        expect(
            collect(() => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append(pick('Ada', 'u-ada'), $createTextNode(' hi')));
            })
        ).toEqual({ userIds: ['u-ada'] });
    });

    it('names a member picked twice once', () => {
        expect(
            collect(() => {
                $getRoot()
                    .clear()
                    .append(
                        $createParagraphNode().append(
                            pick('Ada', 'u-ada'),
                            $createTextNode(' and '),
                            pick('Bo', 'u-bo'),
                            $createTextNode(' and '),
                            pick('Ada', 'u-ada')
                        )
                    );
            })
        ).toEqual({ userIds: ['u-ada', 'u-bo'] });
    });

    it('says everyone was called when the everyone row was picked', () => {
        expect(
            collect(() => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append($createMentionNode('@all', { everyone: true })));
            })
        ).toEqual({ all: true });
    });

    it('names both the members and everyone when both were picked', () => {
        expect(
            collect(() => {
                $getRoot()
                    .clear()
                    .append(
                        $createParagraphNode().append(
                            pick('Ada', 'u-ada'),
                            $createTextNode(' '),
                            $createMentionNode('@all', { everyone: true })
                        )
                    );
            })
        ).toEqual({ userIds: ['u-ada'], all: true });
    });

    // `@all` typed by hand is drawn as a chip when a message is opened, and calls no one.
    it('is nothing for an everyone word that was not picked', () => {
        expect(collect(() => $importWireMarkdown('@all heads up', []))).toBeUndefined();
    });

    it('keeps the everyone pick through a serialised editor state', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append($createMentionNode('@all', { everyone: true })));
            },
            { discrete: true }
        );
        const restored = makeEditor();
        restored.setEditorState(restored.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())));
        expect(restored.read(() => $collectMention())).toEqual({ all: true });
    });

    it('is nothing for a name typed by hand', () => {
        expect(collect(() => $importWireMarkdown('hi @Ada'))).toBeUndefined();
    });

    // A chip restored from text (an opened message, a draft) shows the name but holds no pick.
    it('is nothing for a chip restored from text', () => {
        expect(collect(() => $importWireMarkdown('hi @Ada', ['Ada']))).toBeUndefined();
    });

    it('is nothing once the picked chip is removed', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append(pick('Ada', 'u-ada'), $createTextNode(' hi')));
            },
            { discrete: true }
        );
        editor.update(
            () =>
                $getRoot()
                    .getAllTextNodes()
                    .filter($isMentionNode)
                    .forEach(node => node.remove()),
            { discrete: true }
        );
        expect(editor.read(() => $collectMention())).toBeUndefined();
    });

    // Backspace on a segmented chip takes one word, not the whole name: Lexical's `$removeSegment`
    // rewrites the same node's text ("@Ada Lovelace" becomes "@Ada"), so the chip and its id live
    // on. jsdom has no `Selection.modify` to press the key with, so this makes the same write.
    it('is nothing once the picked name has been cut short', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                const chip = pick('Ada Lovelace', 'u-ada');
                $getRoot().clear().append($createParagraphNode().append(chip));
                chip.setTextContent('@Ada');
            },
            { discrete: true }
        );
        expect(editor.read(() => $getRoot().getAllTextNodes().filter($isMentionNode).length)).toBe(1);
        expect(editor.read(() => $collectMention())).toBeUndefined();
    });

    // Lexical clones a node on every write to it; a clone that dropped the id would send a
    // message that reads as a mention and calls no one.
    it('keeps the id through a later change to the chip', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append(pick('Ada', 'u-ada')));
            },
            { discrete: true }
        );
        editor.update(
            () =>
                $getRoot()
                    .getAllTextNodes()
                    .filter($isMentionNode)
                    .forEach(node => node.toggleFormat('bold')),
            { discrete: true }
        );
        expect(editor.read(() => $collectMention())).toEqual({ userIds: ['u-ada'] });
    });

    it('keeps the id through a serialised editor state', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append(pick('Ada', 'u-ada')));
            },
            { discrete: true }
        );
        const restored = makeEditor();
        restored.setEditorState(restored.parseEditorState(JSON.stringify(editor.getEditorState().toJSON())));
        expect(restored.read(() => $collectMention())).toEqual({ userIds: ['u-ada'] });
    });

    // A state serialised before chips carried an id has no such field.
    it('reads a chip serialised without an id as a chip that picks no one', () => {
        const editor = makeEditor();
        editor.update(
            () => {
                $getRoot()
                    .clear()
                    .append($createParagraphNode().append($createMentionNode('@Ada')));
            },
            { discrete: true }
        );
        const serialised = JSON.stringify(editor.getEditorState().toJSON());
        expect(serialised).not.toContain('userId');
        const restored = makeEditor();
        restored.setEditorState(restored.parseEditorState(serialised));
        expect(restored.read(() => $getRoot().getAllTextNodes().filter($isMentionNode).length)).toBe(1);
        expect(restored.read(() => $collectMention())).toBeUndefined();
    });
});
