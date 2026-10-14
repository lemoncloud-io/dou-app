import { fireEvent, render, screen } from '@testing-library/react';

import { CodeBlock, InlineCode } from './CodeBlock';

describe('CodeBlock', () => {
    it('renders the code body', () => {
        render(<CodeBlock code="const x = 1;" />);
        expect(screen.getByText('const x = 1;')).toBeInTheDocument();
    });

    it('shows the language tag when given', () => {
        render(<CodeBlock code="x" lang="ts" />);
        expect(screen.getByText('ts')).toBeInTheDocument();
    });

    it('omits the copy button without onCopy', () => {
        render(<CodeBlock code="x" lang="ts" />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('fires onCopy', () => {
        const onCopy = jest.fn();
        render(<CodeBlock code="x" onCopy={onCopy} copyLabel="복사" />);

        fireEvent.click(screen.getByRole('button', { name: '복사' }));
        expect(onCopy).toHaveBeenCalledTimes(1);
    });

    it('reflects the copied state', () => {
        render(<CodeBlock code="x" onCopy={jest.fn()} copyLabel="복사" copiedLabel="복사됨" copied />);
        expect(screen.getByRole('button', { name: '복사됨' })).toBeInTheDocument();
    });

    it('draws a copy icon, and a check once copied', () => {
        const { container, rerender } = render(<CodeBlock code="x" onCopy={jest.fn()} copyLabel="복사" />);
        expect(container.querySelector('svg.lucide-copy')).not.toBeNull();
        expect(screen.getByRole('button', { name: '복사' })).toHaveTextContent('복사');

        rerender(<CodeBlock code="x" onCopy={jest.fn()} copyLabel="복사" copiedLabel="복사됨" copied />);
        expect(container.querySelector('svg.lucide-check')).not.toBeNull();
        expect(container.querySelector('svg.lucide-copy')).toBeNull();
    });

    // On my navy bubble a dark tint is invisible; the block switches to a light one there.
    it('takes a light tint inside my bubble', () => {
        const { container } = render(<CodeBlock code="x" />);
        expect(container.firstElementChild?.className).toContain('group-data-[variant=mine]/bubble:bg-white/10');
    });

    it('forwards buttonProps to the copy button', () => {
        const onPointerDown = jest.fn();
        render(<CodeBlock code="x" onCopy={jest.fn()} buttonProps={{ onPointerDown }} />);

        fireEvent.pointerDown(screen.getByRole('button'));
        expect(onPointerDown).toHaveBeenCalledTimes(1);
    });

    // Horizontal scrolling is what stands in for syntax highlighting, so it is a contract, not a
    // style detail: a long line must scroll inside the block rather than wrap or widen the bubble.
    it('scrolls a long line instead of wrapping it', () => {
        render(<CodeBlock code={'x'.repeat(400)} />);
        const body = screen.getByText('x'.repeat(400));

        expect(body.className).toContain('whitespace-pre');
        expect(body.parentElement?.className).toContain('overflow-x-auto');
    });

    // MessageBubble wraps children in a <span>; a <pre> there would be invalid HTML nesting.
    it('uses no <pre> element', () => {
        const { container } = render(<CodeBlock code="x" lang="ts" onCopy={jest.fn()} />);
        expect(container.querySelector('pre')).toBeNull();
    });
});

describe('InlineCode', () => {
    it('renders its children in a code element', () => {
        render(<InlineCode>npm i</InlineCode>);
        const node = screen.getByText('npm i');

        expect(node.tagName).toBe('CODE');
        expect(node.className).toContain('font-mono');
    });

    it('takes a light tint inside my bubble', () => {
        render(<InlineCode>npm i</InlineCode>);
        expect(screen.getByText('npm i').className).toContain('group-data-[variant=mine]/bubble:bg-white/15');
    });
});
