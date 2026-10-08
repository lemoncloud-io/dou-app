import { describe, expect, it } from 'vitest';

import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    createEditor,
    type LexicalEditor,
    type TextNode,
} from 'lexical';

import { COMPOSER_NODES } from './editorConfig';
import { $isMentionNode } from './MentionNode';
import { $exportWireMarkdown, $importWireMarkdown } from './wireMarkdown';

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
