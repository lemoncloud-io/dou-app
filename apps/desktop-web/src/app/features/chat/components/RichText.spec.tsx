import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MSG_BOLD_CLASS, MSG_CODE_BLOCK_CLASS } from '@chatic/block-kit';

import { RichText } from './RichText';

const renderText = (content: string) => render(<p>{RichText({ content })}</p>).container;

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
