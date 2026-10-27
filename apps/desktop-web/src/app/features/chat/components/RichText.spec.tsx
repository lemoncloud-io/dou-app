import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical';

import { MSG_BOLD_CLASS, MSG_CODE_BLOCK_CLASS } from '@chatic/block-kit';

import { COMPOSER_NODES, $exportWireMarkdown } from './editor';
import { RichText } from './RichText';

const renderText = (
    content: string,
    props?: {
        selfNames?: string[];
        resolveMention?: (name: string) => { userId: string; name: string } | undefined;
        hasMentionRecord?: boolean;
        selfSuffix?: string;
    }
) => render(<p>{RichText({ content, ...props })}</p>).container;

const textsOf = (container: HTMLElement, className: string) =>
    Array.from(container.getElementsByClassName(className.split(' ')[0] as string)).map(node => node.textContent);

const codeBlocks = (container: HTMLElement) => textsOf(container, MSG_CODE_BLOCK_CLASS);

describe('RichText fenced code', () => {
    it('shows a fenced command without its language tag as the first line', () => {
        const container = renderText('```sh\ngit clone x\n```');
        expect(codeBlocks(container)).toEqual(['git clone x']);
        expect(container.textContent).toBe('git clone x');
    });

    it('shows a four-backtick fence as one block with no stray backticks around it', () => {
        const container = renderText('````sh\nA\n````');
        expect(codeBlocks(container)).toEqual(['A']);
        expect(container.textContent).toBe('A');
    });

    it('still renders a one-line fence in a sentence and leaves an unclosed fence as text', () => {
        const container = renderText('run ```npm ci``` then ```oops');
        expect(codeBlocks(container)).toEqual(['npm ci']);
        expect(container.textContent).toBe('run npm ci then ```oops');
    });

    it('keeps formatting outside the block and none inside it', () => {
        const container = renderText('**bold**\n```\n**not bold**\n```');
        expect(codeBlocks(container)).toEqual(['**not bold**']);
        expect(textsOf(container, MSG_BOLD_CLASS)).toEqual(['bold']);
    });

    it('starts the text after a block on the next line, not one line further down', () => {
        const container = renderText('```\nls\n```\ndone');
        expect(container.textContent).toBe('lsdone');
    });

    it('keeps a blank line the writer left after a block', () => {
        const container = renderText('```\nls\n```\n\ndone');
        expect(container.textContent).toBe('ls\ndone');
    });
});

describe('RichText labelled links', () => {
    it('shows the label as a link to the address', () => {
        const container = renderText('see [the docs](https://example.com/a) here');
        const link = container.querySelector('a');
        expect(link?.textContent).toBe('the docs');
        expect(link?.getAttribute('href')).toBe('https://example.com/a');
        expect(container.textContent).toBe('see the docs here');
    });

    it('leaves a label pointing anywhere but http(s) as text', () => {
        const container = renderText('[x](javascript:alert(1))');
        expect(container.querySelector('a')).toBeNull();
        expect(container.textContent).toBe('[x](javascript:alert(1))');
    });
});

describe('RichText marks', () => {
    const marked = (container: HTMLElement, selector: string) =>
        Array.from(container.querySelectorAll(selector)).map(node => node.textContent);

    // The composer's B and I buttons together: the message has to read the way it was typed.
    it('shows a message sent bold and italic as both, with no asterisks left over', () => {
        const editor = createEditor({
            namespace: 'rich-text-spec',
            nodes: COMPOSER_NODES,
            onError: error => {
                throw error;
            },
        });
        editor.update(
            () => {
                const text = $createTextNode('123123').toggleFormat('bold').toggleFormat('italic');
                $getRoot().append($createParagraphNode().append(text));
            },
            { discrete: true }
        );
        const container = renderText(editor.read($exportWireMarkdown));
        expect(container.textContent).toBe('123123');
        expect(marked(container, 'strong em, em strong')).toEqual(['123123']);
    });

    it('draws italic inside part of a bold run, and bold inside an italic one', () => {
        const container = renderText('**a *b* c** and *d **e** f*');
        expect(container.textContent).toBe('a b c and d e f');
        expect(marked(container, 'strong')).toEqual(['a b c', 'e']);
        expect(marked(container, 'em')).toEqual(['b', 'd e f']);
    });

    it('draws strikethrough stacked with bold or italic', () => {
        const container = renderText('**~~gone~~** ~~*also*~~');
        expect(container.textContent).toBe('gone also');
        expect(marked(container, 'strong s')).toEqual(['gone']);
        expect(marked(container, 's em')).toEqual(['also']);
    });

    it('keeps separate marks on one line apart', () => {
        const container = renderText('**a** and **b**, *c* and *d*');
        expect(marked(container, 'strong')).toEqual(['a', 'b']);
        expect(marked(container, 'em')).toEqual(['c', 'd']);
    });

    it('reads only marks inside a mark, leaving an address there as its words', () => {
        const container = renderText('***https://example.com/a***');
        expect(container.querySelector('a')).toBeNull();
        expect(marked(container, 'strong em')).toEqual(['https://example.com/a']);
    });

    it('leaves an unclosed mark as text', () => {
        const container = renderText('***a** b');
        expect(container.textContent).toBe('*a b');
        expect(marked(container, 'strong')).toEqual(['a']);
    });
});

describe('RichText quotes', () => {
    it('draws "> " lines as one quote block without their markers', () => {
        const container = renderText('a\n> one\n> two\nb');
        const quotes = container.querySelectorAll('span.block');
        expect(quotes).toHaveLength(1);
        expect(quotes[0]?.textContent).toBe('one\ntwo');
    });

    // The editor only reads `> ` as a quote, so the reader must not either: `>_<` is a face.
    it('leaves an emoticon that starts with > as text', () => {
        const container = renderText('좋아요\n>_< 고마워');
        expect(container.querySelector('span.block')).toBeNull();
        expect(container.textContent).toBe('좋아요\n>_< 고마워');
    });
});

describe('RichText mentions', () => {
    // Both pill classes open with `rounded`, so tell them apart by their fill.
    const ordinary = (container: HTMLElement) => textsOf(container, 'bg-primary/10');
    const self = (container: HTMLElement) => textsOf(container, 'bg-warning/30');
    const pills = (container: HTMLElement) => [...ordinary(container), ...self(container)];

    it('leaves an address inside a word as plain text', () => {
        const container = renderText('mail me at lemon@lemoncloud.io please');
        expect(pills(container)).toEqual([]);
        expect(container.textContent).toBe('mail me at lemon@lemoncloud.io please');
    });

    it('leaves a word-internal @token as plain text', () => {
        const container = renderText('pw lemoncloud@123 here');
        expect(pills(container)).toEqual([]);
        expect(container.textContent).toBe('pw lemoncloud@123 here');
    });

    it('leaves an unknown @word at a boundary as plain text', () => {
        const container = renderText('hi @stranger, welcome');
        expect(pills(container)).toEqual([]);
        expect(container.textContent).toBe('hi @stranger, welcome');
    });

    it('opens the profile of a known member named at a boundary', () => {
        const seen: string[] = [];
        const container = renderText('hi @Aiden, welcome', {
            resolveMention: name => {
                seen.push(name);
                return { userId: 'u-aiden', name: 'Aiden' };
            },
        });
        expect(container.querySelector('button')?.textContent).toBe('@Aiden');
        expect(seen).toEqual(['Aiden']);
    });

    it('still recognises a known member before sentence-final punctuation', () => {
        const container = renderText('thanks @Aiden.', {
            resolveMention: name => (name === 'Aiden' ? { userId: 'u-aiden', name: 'Aiden' } : undefined),
        });
        expect(container.querySelector('button')?.textContent).toBe('@Aiden.');
    });

    it('draws a group word as an ordinary mention', () => {
        const container = renderText('@channel hi');
        expect(ordinary(container)).toEqual(['@channel']);
        expect(self(container)).toEqual([]);
    });

    it('draws my name as a mention of me', () => {
        const container = renderText('@Me hi', { selfNames: ['me'] });
        expect(self(container)).toEqual(['@Me']);
        expect(ordinary(container)).toEqual([]);
    });

    it('marks a self pill with weight and a screen-reader cue', () => {
        const container = renderText('@Me hi', { selfNames: ['me'], selfSuffix: 'me' });
        const pill = container.getElementsByClassName('bg-warning/30')[0];
        expect(pill?.className).toContain('font-semibold');
        expect(container.querySelector('.sr-only')?.textContent).toBe('me');
    });

    it('draws a recorded mention as ordinary when the record names someone else', () => {
        const container = renderText('@Me hi', { selfNames: [], hasMentionRecord: true });
        expect(ordinary(container)).toEqual(['@Me']);
        expect(self(container)).toEqual([]);
    });
});
