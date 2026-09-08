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
    // Five lines is two saved for one line of chrome — the floor, and below it
    // the fold costs more than it returns. A short trace stays a short trace.
    it('leaves a short block alone', () => {
        render(<BlockKitMessage blocks={fenced(5)} raw="" />);
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.getByText(/line 5/)).toBeDefined();
    });

    // The design's error card carries six trace lines and folds them. That card
    // is what set the threshold, so it is the case worth pinning.
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

    // The fold is how much of the trace is on screen, not how much of it exists.
    // Search, the sidebar preview and OS notifications read the flattened copy,
    // and folding must not reach them.
    it('does not fold the flattened copy', () => {
        expect(blocksToPlainText(fenced(9))).toContain('line 9');
    });
});
