import { describe, expect, it } from 'vitest';

import { fireEvent, render, screen } from '@testing-library/react';

import { blocksToPlainText } from './blocksToPlainText';
import { BlockKitMessage } from './BlockKitMessage';
import type { KnownBlock } from './blockKit';

const fenced = (lines: number): KnownBlock[] => [
    {
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `\`\`\`${Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n')}\`\`\``,
        },
    },
];

describe('CollapsibleCode', () => {
    it('leaves a short block alone', () => {
        render(<BlockKitMessage blocks={fenced(5)} raw="" />);
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByText(/line 5/)).toBeDefined();
    });

    it('folds the six-line trace the design folds', () => {
        render(<BlockKitMessage blocks={fenced(6)} raw="" />);
        expect(screen.getByRole('button')).toBeDefined();
    });

    it('folds a long block to its first lines', () => {
        render(<BlockKitMessage blocks={fenced(9)} raw="" />);
        expect(screen.getByText(/line 3/)).toBeDefined();
        expect(screen.queryByText(/line 4/)).toBeNull();
    });

    it('shows the rest, and folds it back', () => {
        render(<BlockKitMessage blocks={fenced(9)} raw="" />);
        const toggle = screen.getByRole('button');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(toggle);
        expect(screen.getByText(/line 9/)).toBeDefined();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(toggle);
        expect(screen.queryByText(/line 9/)).toBeNull();
    });

    it('does not fold the flattened copy', () => {
        expect(blocksToPlainText(fenced(9))).toContain('line 9');
    });

    it.each([
        ['phone', 'text-[0.8125rem]'],
        ['desktop', 'text-[0.875rem]'],
    ] as const)('sizes the trace and its toggle for the %s card', (scale, size) => {
        render(<BlockKitMessage blocks={fenced(9)} raw="" scale={scale} />);
        expect(screen.getByText(/line 1/).className).toContain(size);
        expect(screen.getByRole('button').className).toContain(size);
    });
});
